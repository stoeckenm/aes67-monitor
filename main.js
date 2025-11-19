// main.js
const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const crypto = require("crypto");
const { fork } = require("child_process");

// Import refactored modules - calling paths ensures app.setPath is done early
require("./backend/config/paths");
const {
	loadPersistentData,
	loadUserData,
	getPersistentData,
	getUserData,
	scheduleSaveUserData,
} = require("./backend/persistence/persistence");
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
	setIsStreamRunning,
} = require("./backend/ipc/ipcHandler");

// -----------------------------------------------------
// Globals
// -----------------------------------------------------
let mainWindow;
let sdpProcess = null;
let audioProcess = null;
let streamsHash = null;
let isSDPInitialized = false;
let systemUpdateInterval;

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
	if (isStreamRunning) handleIpcMessage({ type: "stop" });
	sendMessage("refreshAfterDeviceChange");
}

// -----------------------------------------------------
// IPC Handlers (calls from renderer)
// -----------------------------------------------------
ipcMain.handle("get-shared-config", async () => ({
	persistentData: getPersistentData(),
	userData: getUserData(),
}));

ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));

// -----------------------------------------------------
// Create Main Window
// -----------------------------------------------------
function getWindowState() {
	const s = getUserData().settings.window;
	return {
		width: s.width || 1280,
		height: s.height || 800,
		x: s.x ?? undefined,
		y: s.y ?? undefined,
		maximized: s.maximized ?? true,
	};
}

function createMainWindow() {
	const winState = getWindowState();
	mainWindow = new BrowserWindow({
		width: winState.width,
		height: winState.height,
		x: winState.x !== null ? winState.x : undefined,
		y: winState.y !== null ? winState.y : undefined,
		autoHideMenuBar: app.isPackaged,
		show: false,
		webPreferences: {
			// Adjust preload.js path based on your build process
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
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
async function lazyInit() {
	// 1. Initialize Audio (sets API and creates rtAudio instance)
	initAudio(sendMessage, restartStream);

	// 2. Spawn child processes (adjust paths to your actual lib folder)
	sdpProcess = fork(path.join(__dirname, "./src/lib/sdp.js"));
	audioProcess = fork(path.join(__dirname, "./src/lib/audio.js"));

	// 3. Initialize IPC Handler with process/callback references
	initIpcHandler(sdpProcess, audioProcess, sendMessage, () =>
		saveWindowState(mainWindow)
	);

	// 4. Listen for SDP messages
	sdpProcess.on("message", (data) => {
		sendMessage("streams", data);
		// Streams hash logic for persistence update
		const combinedRaw = data.map((s) => (s.manual ? s.raw : "")).join("");
		const newHash = crypto
			.createHash("sha256")
			.update(combinedRaw)
			.digest("hex");
		if (newHash !== streamsHash) {
			streamsHash = newHash;
			require("./backend/persistence/persistence").scheduleSavePersistentData();
		}
	});

	// 5. Restore saved audio interface
	restoreAudioInterface();

	// 6. Start system update loop (reduced frequency)
	systemUpdateInterval = setInterval(updateSystem, 2000);
}

// -----------------------------------------------------
// System update loop
// -----------------------------------------------------
function updateSystem() {
	const { interfaces: networkInterfaces } = updateNetworkInterfaces();
	refreshCurrentAudioInterface();
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
	}
	sendMessage("interfaces", networkInterfaces);
}

// -----------------------------------------------------
// App lifecycle
// -----------------------------------------------------
app.whenReady().then(async () => {
	await loadPersistentData();
	await loadUserData();
	createMainWindow();
	lazyInit();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

app.on("window-all-closed", () => {
	if (systemUpdateInterval) clearInterval(systemUpdateInterval);
	sdpProcess?.kill();
	audioProcess?.kill();
	app.quit();
});
