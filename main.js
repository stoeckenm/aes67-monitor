// main.js
const {
	app,
	BrowserWindow,
	ipcMain,
	powerMonitor,
	screen,
	session,
} = require("electron/main");
const path = require("node:path");
const { fork } = require("child_process");

// Import refactored modules - calling paths ensures app.setPath is done early
require("./backend/config/paths");
const {
	loadPersistentData,
	loadUserData,
	getPersistentData,
	getPersistentDataForRenderer,
	getUserData,
	scheduleSaveUserData,
	scheduleSavePersistentData,
} = require("./backend/persistence/persistence");
const { hashPassword, verifyPassword } = require("./backend/system/password");
const {
	initAudio,
	restoreAudioInterface,
	refreshCurrentAudioInterface,
} = require("./backend/system/audio");
const {
	updateNetworkInterfaces,
	getCurrentNetworkInterface,
} = require("./backend/system/network");
const {
	handleIpcMessage,
	init: initIpcHandler,
	setWorkers,
} = require("./backend/ipc/ipcHandler");

// -----------------------------------------------------
// Globals
// -----------------------------------------------------
let mainWindow;
let sdpProcess = null;
let audioProcess = null;
let isSDPInitialized = false;
let systemUpdateInterval;
let isQuitting = false;

// -----------------------------------------------------
// Worker supervision
// -----------------------------------------------------
// Both workers parse data straight off the network. Without a respawn a single
// bad announcement used to leave discovery or playback dead until restart.
const WORKER_RESTART_DELAY = 1000;
const WORKER_RESTART_DELAY_MAX = 30000;
const workerBackoff = {
	sdp: WORKER_RESTART_DELAY,
	audio: WORKER_RESTART_DELAY,
};

function spawnWorker(name, scriptPath, onMessage, onRespawn) {
	const child = fork(path.join(__dirname, scriptPath));

	child.on("message", onMessage);

	child.on("error", (err) => {
		console.error(`[${name}] worker error`, err);
	});

	child.on("exit", (code, signal) => {
		if (isQuitting) return;
		console.error(`[${name}] worker exited (code=${code} signal=${signal})`);
		sendMessage("workerError", {
			worker: name,
			code: "workerRestarted",
			message: `The ${name} service stopped unexpectedly and was restarted.`,
		});

		const delay = workerBackoff[name];
		workerBackoff[name] = Math.min(delay * 2, WORKER_RESTART_DELAY_MAX);
		setTimeout(() => {
			if (isQuitting) return;
			console.log(`[${name}] respawning worker`);
			onRespawn();
		}, delay);
	});

	// A worker that stays up for a while is considered healthy again
	setTimeout(() => {
		if (!child.killed) workerBackoff[name] = WORKER_RESTART_DELAY;
	}, WORKER_RESTART_DELAY_MAX);

	return child;
}

function handleWorkerMessage(name, data) {
	if (data && data.type === "error") {
		console.error(`[${name}] ${data.data}`);
		sendMessage("workerError", {
			worker: name,
			code: "workerFailure",
			message: data.data,
		});
		return true;
	}
	return false;
}

// -----------------------------------------------------
// Helper: Send to renderer
// -----------------------------------------------------
function sendMessage(type, data) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		mainWindow.webContents.send("send-message", { type, data });
	}
}

// -----------------------------------------------------
// Helper: Save window state
// -----------------------------------------------------
function saveWindowState(win) {
	if (!win || win.isDestroyed()) return;
	const userData = getUserData();
	const bounds = win.getBounds();
	userData.settings.window = {
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		maximized: win.isMaximized(),
	};
	scheduleSaveUserData();
}

// -----------------------------------------------------
// Helper: Restart Stream (used by audio.js)
// -----------------------------------------------------
function restartStream() {
	handleIpcMessage({ type: "stop" });
	sendMessage("refreshAfterDeviceChange");
}

// -----------------------------------------------------
// IPC Handlers (calls from renderer)
// -----------------------------------------------------
ipcMain.handle("get-shared-config", async () => ({
	persistentData: getPersistentDataForRenderer(),
	userData: getUserData(),
}));

// Verified here, not in the renderer, so the stored hash never leaves the main
// process. A matching legacy SHA-256 hash is upgraded to scrypt in place.
ipcMain.handle("verify-admin-password", async (_event, password) => {
	const persistentData = getPersistentData();
	if (!persistentData.passwordHash) return { ok: true, unlocked: true };

	const { ok, needsRehash } = await verifyPassword(
		password,
		persistentData.passwordHash,
	);
	if (ok && needsRehash) {
		persistentData.passwordHash = await hashPassword(password);
		scheduleSavePersistentData();
	}
	return { ok, unlocked: ok };
});

// An empty or null password clears the lock; the UI asks separately for that.
ipcMain.handle("set-admin-password", async (_event, password) => {
	const persistentData = getPersistentData();
	if (!password) {
		persistentData.passwordHash = null;
	} else {
		persistentData.passwordHash = await hashPassword(String(password));
	}
	scheduleSavePersistentData();
	sendMessage("updatePersistentData", getPersistentDataForRenderer());
	return { hasPassword: persistentData.passwordHash !== null };
});

ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));

// -----------------------------------------------------
// Create Main Window
// -----------------------------------------------------
// Saved coordinates can point at a monitor that is no longer connected, which
// would open the window off-screen. Only keep them if they still land on a
// display that is actually attached.
function isVisibleOnSomeDisplay(x, y, width, height) {
	if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
	return screen.getAllDisplays().some((display) => {
		const area = display.workArea;
		return (
			x + width > area.x &&
			y + height > area.y &&
			x < area.x + area.width &&
			y < area.y + area.height
		);
	});
}

function getWindowState() {
	const s = getUserData().settings.window;
	const width = s.width || 1280;
	const height = s.height || 800;
	const onScreen = isVisibleOnSomeDisplay(s.x, s.y, width, height);
	return {
		width,
		height,
		x: onScreen ? s.x : undefined,
		y: onScreen ? s.y : undefined,
		maximized: s.maximized ?? true,
	};
}

function applyContentSecurityPolicy() {
	// Only in the packaged app: the dev server needs eval for its sourcemaps
	// and injects styles inline.
	if (!app.isPackaged) return;

	// The packaged renderer is loaded over file://, where Chromium does not
	// treat 'self' as matching the page's own scheme, so the file: scheme is
	// listed explicitly. Without it the bundle itself would be blocked and the
	// window would come up blank. What this still prevents is the part that
	// matters here: remote script sources and inline script, i.e. the vector
	// for markup arriving in a stream name from a SAP announcement.
	const policy = [
		"default-src 'self' file:",
		"script-src 'self' file:",
		"style-src 'self' file: 'unsafe-inline'",
		"img-src 'self' file: data:",
		"font-src 'self' file: data:",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
	].join("; ");

	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		callback({
			responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [policy],
			},
		});
	});
}

function createMainWindow() {
	const winState = getWindowState();
	mainWindow = new BrowserWindow({
		width: winState.width,
		height: winState.height,
		x: winState.x,
		y: winState.y,
		autoHideMenuBar: app.isPackaged,
		show: false,
		webPreferences: {
			// Adjust preload.js path based on your build process
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	if (winState.maximized) {
		mainWindow.maximize();
	}

	const saveWindow = () => saveWindowState(mainWindow);
	mainWindow.on("resize", saveWindow);
	mainWindow.on("move", saveWindow);
	mainWindow.on("maximize", saveWindow);
	mainWindow.on("unmaximize", saveWindow);

	// Load your app based on packaged status
	if (app.isPackaged) {
		mainWindow.loadFile("./dist/index.html");
	} else {
		mainWindow.loadURL("http://localhost:8888");
	}

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});
}

// -----------------------------------------------------
// Lazy Initialization
// -----------------------------------------------------
let manualStreamSignature = null;
let manualStreamsRestored = false;

// The discovery worker owns the session list, so manual streams are mirrored
// out of it rather than tracked separately. Previously main hashed their raw
// SDP on every update and saved persistentData, which never held them at all,
// so they were lost on restart.
function syncManualStreams(streams) {
	// A freshly spawned worker reports an empty list until the stored streams
	// have been handed back to it. Mirroring that would erase them.
	if (!manualStreamsRestored) return;

	const manual = streams
		.filter((s) => s.manual)
		.map((s) => ({ id: s.id, sdp: s.raw, announce: !!s.announce }));

	const signature = manual
		.map((s) => `${s.id}:${s.announce ? 1 : 0}`)
		.join("|");
	if (signature === manualStreamSignature) return;
	manualStreamSignature = signature;

	const persistentData = getPersistentData();
	persistentData.manualStreams = manual;
	scheduleSavePersistentData();
}

function onSdpMessage(data) {
	if (handleWorkerMessage("sdp", data)) return;
	if (!Array.isArray(data)) return;

	syncManualStreams(data);
	sendMessage("streams", data);
}

// Hand the stored manual streams back to a freshly started worker, which
// starts out knowing nothing.
function restoreManualStreams() {
	const { manualStreams } = getPersistentData();
	if (!Array.isArray(manualStreams) || manualStreams.length === 0) return;
	for (const stream of manualStreams) {
		if (!stream?.sdp) continue;
		sdpProcess?.send({
			type: "add",
			data: { sdp: stream.sdp, announce: !!stream.announce },
		});
	}
	console.log(`Restored ${manualStreams.length} manual stream(s)`);
}

function startSdpWorker() {
	sdpProcess = spawnWorker(
		"sdp",
		"./src/lib/sdp.js",
		onSdpMessage,
		startSdpWorker,
	);
	setWorkers(sdpProcess, audioProcess);
	// A fresh worker knows nothing, so re-send the interface, the timeout and
	// the manual streams it had before on the next system pass.
	isSDPInitialized = false;
	manualStreamsRestored = false;
}

function startAudioWorker() {
	audioProcess = spawnWorker(
		"audio",
		"./src/lib/audio.js",
		(data) => handleWorkerMessage("audio", data),
		startAudioWorker,
	);
	setWorkers(sdpProcess, audioProcess);
	// Playback cannot survive a worker restart; let the renderer decide whether
	// to resume so its play state stays truthful.
	handleIpcMessage({ type: "playingStatus", data: { isPlaying: false } });
	sendMessage("refreshAfterDeviceChange");
}

async function lazyInit() {
	// 1. Initialize Audio (sets API and creates rtAudio instance)
	initAudio(sendMessage, restartStream);

	// 2. Initialize IPC Handler with callback references
	initIpcHandler(sendMessage, () => saveWindowState(mainWindow));

	// 3. Spawn supervised child processes
	startSdpWorker();
	audioProcess = spawnWorker(
		"audio",
		"./src/lib/audio.js",
		(data) => handleWorkerMessage("audio", data),
		startAudioWorker,
	);
	setWorkers(sdpProcess, audioProcess);

	// 4. Restore saved audio interface
	restoreAudioInterface();

	// 5. Start system update loop
	systemUpdateInterval = setInterval(updateSystem, SYSTEM_POLL_MS);

	// Devices and interfaces also change on events, which is cheaper and far
	// more responsive than shortening the poll interval.
	powerMonitor.on("resume", () => updateSystem({ force: true }));
	app.on("browser-window-focus", () => updateSystem({ force: true }));
}

// -----------------------------------------------------
// System update loop
// -----------------------------------------------------
const SYSTEM_POLL_MS = 5000;
let lastInterfaceSignature = "";

function updateSystem({ force = false } = {}) {
	const { interfaces: networkInterfaces } = updateNetworkInterfaces();
	refreshCurrentAudioInterface({ force });
	const currentNetworkInterface = getCurrentNetworkInterface();
	const persistentData = getPersistentData();

	if (!isSDPInitialized && currentNetworkInterface) {
		console.log("Initializing SDP...");
		isSDPInitialized = true;
		sdpProcess?.send({ type: "init", data: currentNetworkInterface.address });
		sdpProcess?.send({
			type: "deleteTimeout",
			data: persistentData.settings.sdpDeleteTimeout,
		});
		restoreManualStreams();
		manualStreamsRestored = true;
	}

	// Only push when the list actually changed; this used to fire on every
	// tick and reassign the array in the renderer each time.
	const signature = JSON.stringify(networkInterfaces);
	if (force || signature !== lastInterfaceSignature) {
		lastInterfaceSignature = signature;
		sendMessage("interfaces", networkInterfaces);
	}
}

// -----------------------------------------------------
// App lifecycle
// -----------------------------------------------------
// A second instance would bind the same SAP port and race the first one for
// the config file, so hand focus to the running window instead.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(async () => {
		await loadPersistentData();
		await loadUserData();
		applyContentSecurityPolicy();
		createMainWindow();
		lazyInit();
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
		});
	});
}

app.on("before-quit", () => {
	isQuitting = true;
});

app.on("window-all-closed", () => {
	isQuitting = true;
	if (systemUpdateInterval) clearInterval(systemUpdateInterval);
	sdpProcess?.kill();
	audioProcess?.kill();
	app.quit();
});
