const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const fs = require("node:fs/promises"); // async fs
const crypto = require("crypto");
const os = require("os");
const { RtAudio, RtAudioApi } = require("audify");
const { fork } = require("child_process");

// -----------------------------------------------------
// Paths and config
// -----------------------------------------------------
// Shared (machine-wide) config
const persistentDir =
	process.platform === "win32"
		? path.join(process.env.ProgramData, "StreamMonitor")
		: path.join("/etc/StreamMonitor");
const persistentPath = path.join(persistentDir, "config.json");

// User config (AppData)
const userDir = path.join(app.getPath("appData"), "StreamMonitor");
const userPath = path.join(userDir, "user.json");

// User data folder for cache/logs
app.setPath("userData", path.join(userDir, "user_data"));

// Machine-wide data (network, audio devices, etc.)
let persistentData = {
	settings: {
		bufferSize: 16,
		bufferEnabled: true,
		hideUnsupported: true,
		sdpDeleteTimeout: 300,
		followSystemAudio: true,
		audioInterface: null,
		storedAudioInterface: null,
	},
	network: { interfaces: [], currentInterface: "" },
	devices: [],
	favorites: [],
};

// Per-user data (UI state, etc.)
let userData = {
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
};

// -----------------------------------------------------
// Globals
// -----------------------------------------------------
let mainWindow;
let networkInterfaces = [];
let currentNetworkInterface = null;
let currentAudioDevice = null;
let audioAPI = RtAudioApi.UNSPECIFIED;
let rtAudio;
let isSDPInitialized = false;
let streamsHash = null;
let currentPlayArgs = null;
let previousAudioDevice = null;
let sdpProcess = null;
let audioProcess = null;
let isStreamRunning = false;
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
// Atomic, debounced saving (persistent + user)
// -----------------------------------------------------
let saveTimer = null;
let lastSavedJSON = "";

let saveUserTimer = null;
let lastUserSavedJSON = "";

async function writeAtomic(filePath, data, dirToEnsure) {
	const tmp = `${filePath}.tmp`;
	await fs.mkdir(dirToEnsure, { recursive: true });
	await fs.writeFile(tmp, data);
	await fs.rename(tmp, filePath); // atomic on most platforms
}

function scheduleSavePersistentData(reason = "") {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		try {
			const json = JSON.stringify(persistentData, null, 2);
			if (json !== lastSavedJSON) {
				await writeAtomic(persistentPath, json, persistentDir);
				lastSavedJSON = json;
			}
		} catch (err) {
			console.error("Error saving persistentData:", err);
		}
	}, 300);
}

function scheduleSaveUserData(reason = "") {
	clearTimeout(saveUserTimer);
	saveUserTimer = setTimeout(async () => {
		try {
			const json = JSON.stringify(userData, null, 2);
			if (json !== lastUserSavedJSON) {
				await writeAtomic(userPath, json, userDir);
				lastUserSavedJSON = json;
			}
		} catch (err) {
			console.error("Error saving userData:", err);
		}
	}, 300);
}

// -----------------------------------------------------
// Async config load
// -----------------------------------------------------
async function loadPersistentData() {
	try {
		await fs.mkdir(persistentDir, { recursive: true });
		const exists = await fs
			.access(persistentPath)
			.then(() => true)
			.catch(() => false);

		if (exists) {
			const data = JSON.parse(await fs.readFile(persistentPath, "utf-8"));
			persistentData = {
				...persistentData,
				...data,
				settings: { ...persistentData.settings, ...(data.settings || {}) },
				network: { ...persistentData.network, ...(data.network || {}) },
				devices: Array.isArray(data.devices)
					? data.devices
					: persistentData.devices,
				favorites: Array.isArray(data.favorites)
					? data.favorites
					: persistentData.favorites,
			};
			// seed lastSavedJSON to avoid immediate rewrite on startup
			lastSavedJSON = JSON.stringify(persistentData, null, 2);
		}
	} catch (err) {
		console.error("Error loading persistentData:", err);
	}
}

async function loadUserData() {
	try {
		await fs.mkdir(userDir, { recursive: true });
		const exists = await fs
			.access(userPath)
			.then(() => true)
			.catch(() => false);
		if (exists) {
			const data = JSON.parse(await fs.readFile(userPath, "utf-8"));
			userData = {
				...userData,
				...data,
				settings: { ...userData.settings, ...(data.settings || {}) },
			};
			lastUserSavedJSON = JSON.stringify(userData, null, 2);
		}
	} catch (err) {
		console.error("Error loading userData:", err);
	}
}

// -----------------------------------------------------
// Save window state
// -----------------------------------------------------
function saveWindowState(win) {
	if (!win) return;
	const bounds = win.getBounds();
	userData.settings.window = {
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		maximized: win.isMaximized(),
	};
	scheduleSaveUserData("window-state");
}

// -----------------------------------------------------
// IPC Handlers (calls from renderer)
// -----------------------------------------------------
ipcMain.handle("get-shared-config", async () => ({
	persistentData,
	userData,
}));

ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));

async function handleIpcMessage(message) {
	switch (message.type) {
		case "update":
			sendMessage("updatePersistentData", persistentData);
			updateSystem();
			sdpProcess?.send({ type: "update" });
			break;

		case "setAudioInterface":
			setAudioInterface(message.data);
			break;

		case "restart":
			refreshCurrentAudioInterface();
			audioProcess?.send({
				type: "restart",
				data: {
					networkInterface: currentNetworkInterface?.address || "",
					selected: currentAudioDevice,
				},
			});
			break;

		case "play":
			refreshCurrentAudioInterface();
			currentPlayArgs = {
				...message.data,
				audioAPI,
				networkInterface: currentNetworkInterface?.address || "",
				selected: currentAudioDevice,
			};
			audioProcess?.send({ type: "start", data: currentPlayArgs });
			break;

		case "stop":
			audioProcess?.send({ type: "stop" });
			break;

		case "addStream":
			sdpProcess?.send({ type: "add", data: message.data });
			break;

		case "delete":
			sdpProcess?.send({ type: "delete", data: message.data });
			break;

		case "setNetwork":
			if (currentNetworkInterface?.address !== message.data) {
				persistentData.network.currentInterface = message.data;
				updateNetworkInterfaces();
				audioProcess?.send({ type: "stop" });
				sdpProcess?.send({ type: "interface", data: message.data });
				scheduleSavePersistentData("setNetwork");
			}
			break;

		// Generic 'save' from renderer: message.key is a top-level key of persistentData
		case "save":
			try {
				const parsed = JSON.parse(message.data);
				if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;

					if (
						message.key === "network" &&
						persistentData.network.currentInterface
					) {
						currentNetworkInterface =
							persistentData.network.interfaces.find(
								(i) => i.address === persistentData.network.currentInterface
							) || persistentData.network.interfaces[0];
					}
					if (message.key === "settings") {
						// inform SDP about delete timeout change
						if (sdpProcess) {
							sdpProcess.send({
								type: "deleteTimeout",
								data: persistentData.settings.sdpDeleteTimeout,
							});
						}
					}
					scheduleSavePersistentData("save:key");
				} else {
					console.warn("save: unknown persistentData key:", message.key);
				}
			} catch (err) {
				console.error("save: invalid JSON payload", err);
			}
			break;

		// Save entire or partial persistentData object
		case "savePersistent":
			try {
				const parsed = JSON.parse(message.data);
				if (message.key === "persistentData") {
					// controlled merge to keep defaults and correct arrays
					persistentData = {
						...persistentData,
						...parsed,
						settings: {
							...persistentData.settings,
							...(parsed.settings || {}),
						},
						network: { ...persistentData.network, ...(parsed.network || {}) },
						devices: Array.isArray(parsed.devices)
							? parsed.devices
							: persistentData.devices,
						favorites: Array.isArray(parsed.favorites)
							? parsed.favorites
							: persistentData.favorites,
					};
				} else if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;
				} else {
					console.warn("savePersistent: unexpected key:", message.key);
				}
				scheduleSavePersistentData("savePersistent");
			} catch (err) {
				console.error("savePersistent: failed to parse or save", err);
			}
			break;

		// Save entire or partial userData
		case "saveUser":
			try {
				const parsed = JSON.parse(message.data);
				if (message.key === "userData") {
					userData = {
						...userData,
						...parsed,
						settings: { ...userData.settings, ...(parsed.settings || {}) },
					};
				} else if (
					message.key &&
					Object.prototype.hasOwnProperty.call(userData, message.key)
				) {
					userData[message.key] = parsed;
				} else {
					console.warn("saveUser: unexpected key:", message.key);
				}
				scheduleSaveUserData("saveUser");
			} catch (err) {
				console.error("saveUser: failed to parse or save", err);
			}
			break;

		case "saveWindow":
			saveWindowState(mainWindow);
			break;

		case "playingStatus":
			isStreamRunning = message.data.isPlaying;
			break;

		default:
			console.warn("Unknown IPC message type:", message.type);
	}
}

// -----------------------------------------------------
// Create Main Window
// -----------------------------------------------------
function getWindowState() {
	const s = userData.settings.window;
	return {
		width: s.width || 1280,
		height: s.height || 800,
		x: s.x ?? undefined,
		y: s.y ?? undefined,
		maximized: s.maximized ?? true,
	};
}

function createMainWindow() {
	// Load saved window state
	const winState = getWindowState();
	mainWindow = new BrowserWindow({
		width: winState.width,
		height: winState.height,
		x: winState.x !== null ? winState.x : undefined,
		y: winState.y !== null ? winState.y : undefined,
		autoHideMenuBar: app.isPackaged,
		show: false, // show only after ready-to-show
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	// Restore window maximize state
	if (winState.maximized) {
		mainWindow.maximize();
	}

	// Save state on change
	mainWindow.on("resize", () => saveWindowState(mainWindow));
	mainWindow.on("move", () => saveWindowState(mainWindow));
	mainWindow.on("maximize", () => saveWindowState(mainWindow));
	mainWindow.on("unmaximize", () => saveWindowState(mainWindow));

	// Load your app
	if (app.isPackaged) {
		mainWindow.loadFile("./dist/index.html");
	} else {
		mainWindow.loadURL("http://localhost:8888");
	}

	// Show window when it's fully ready
	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});

	// Block refresh in packaged builds
	if (app.isPackaged) {
		mainWindow.webContents.on("before-input-event", (event, input) => {
			if (
				(input.key.toLowerCase() === "r" && (input.control || input.meta)) ||
				input.key === "F5"
			) {
				event.preventDefault();
			}
		});
	}

	// NOTE: do NOT re-register ipcMain.on("recv-message") here (it already exists globally)
}

// -----------------------------------------------------
// Lazy Initialization
// -----------------------------------------------------
async function lazyInit() {
	// Set audio API based on OS
	switch (process.platform) {
		case "darwin":
			audioAPI = RtAudioApi.MACOSX_CORE;
			break;
		case "win32":
			audioAPI = RtAudioApi.WINDOWS_WASAPI;
			break;
		case "linux":
			audioAPI = RtAudioApi.LINUX_ALSA;
			break;
	}
	rtAudio = new RtAudio(audioAPI);

	// Spawn child processes
	sdpProcess = fork(path.join(__dirname, "./src/lib/sdp.js"));
	audioProcess = fork(path.join(__dirname, "./src/lib/audio.js"));

	// Listen for SDP messages
	sdpProcess.on("message", (data) => {
		sendMessage("streams", data);

		const combinedRaw = data.map((s) => (s.manual ? s.raw : "")).join("");
		const newHash = crypto
			.createHash("sha256")
			.update(combinedRaw)
			.digest("hex");
		if (newHash !== streamsHash) {
			streamsHash = newHash;
			// Only persist if something else also changed. Keeping this to allow state to sync if needed.
			scheduleSavePersistentData("streams-hash");
		}
	});

	// Restore saved audio interface
	restoreAudioInterface();

	// Start system update loop (reduced frequency)
	systemUpdateInterval = setInterval(updateSystem, 2000);
}

// -----------------------------------------------------
// Network / Audio helpers
// -----------------------------------------------------
let lastNetSig = "";

function updateNetworkInterfaces() {
	const interfaces = os.networkInterfaces();
	const addresses = [];
	for (const name of Object.keys(interfaces)) {
		for (const addr of interfaces[name]) {
			if (addr.family === "IPv4" && addr.address !== "127.0.0.1") {
				addresses.push({ name, address: addr.address });
			}
		}
	}

	const network = {
		interfaces: addresses.map((a) => ({ name: a.name, address: a.address })),
		currentInterface: persistentData.network?.currentInterface || "",
	};

	// Pick a default if current is empty or missing
	if (
		!network.currentInterface ||
		!network.interfaces.find((i) => i.address === network.currentInterface)
	) {
		if (addresses.length > 0) {
			network.currentInterface = addresses[0].address;
		} else {
			network.currentInterface = "";
		}
	}

	const current = network.interfaces.find(
		(i) => i.address === network.currentInterface
	);
	if (current) {
		current.isCurrent = true;
		currentNetworkInterface = { name: current.name, address: current.address };
	} else {
		currentNetworkInterface = null;
	}

	persistentData.network = network;
	networkInterfaces = addresses;

	const sig = JSON.stringify(network);
	if (sig !== lastNetSig) {
		lastNetSig = sig;
		scheduleSavePersistentData("network-change");
	}
}

function updateAudioInterfaces() {
	const devices = rtAudio
		.getDevices()
		.filter((d) => d.inputChannels > 0 || d.outputChannels > 0);
	devices.forEach((d) => (d.isCurrent = currentAudioDevice?.id === d.id));
	sendMessage("audioDevices", devices);
}

function setAudioInterface(device) {
	const devices = rtAudio.getDevices();
	let defaultDevice = devices.find((d) => d.isDefaultOutput);
	let storedDevice = persistentData.settings.storedAudioInterface;
	let found = false;

	// Try to use stored device first
	if (storedDevice && !persistentData.settings.followSystemAudio) {
		const matchedDevice = devices.find(
			(d) =>
				d.name === storedDevice.name &&
				d.inputChannels === storedDevice.inputChannels &&
				d.outputChannels === storedDevice.outputChannels
		);
		if (matchedDevice) {
			currentAudioDevice = matchedDevice;
			found = true;
		}
	}

	// If no stored device found or not available, use the passed device
	if (!found && device && !persistentData.settings.followSystemAudio) {
		const matchedDevice = devices.find(
			(d) =>
				d.name === device.name &&
				d.inputChannels === device.inputChannels &&
				d.outputChannels === device.outputChannels
		);
		if (matchedDevice) {
			currentAudioDevice = matchedDevice;
			found = true;
		}
	}

	// Fallback to default if nothing found
	if (!found) {
		currentAudioDevice = defaultDevice;
	}

	// Restart stream if device changed
	if (previousAudioDevice) {
		const changed =
			currentAudioDevice?.name !== previousAudioDevice?.name ||
			currentAudioDevice?.id !== previousAudioDevice?.id;
		if (changed) restartStream();
	}
	previousAudioDevice = currentAudioDevice;

	// Save current selection
	persistentData.settings.audioInterface = currentAudioDevice
		? {
				name: currentAudioDevice.name,
				inputChannels: currentAudioDevice.inputChannels,
				outputChannels: currentAudioDevice.outputChannels,
				id: currentAudioDevice.id,
		  }
		: null;

	scheduleSavePersistentData("audio-interface");
	updateAudioInterfaces();
}

function restoreAudioInterface() {
	const devices = rtAudio.getDevices();
	let savedDevice = persistentData.settings.audioInterface
		? devices.find(
				(d) =>
					d.name === persistentData.settings.audioInterface.name &&
					d.inputChannels ===
						persistentData.settings.audioInterface.inputChannels &&
					d.outputChannels ===
						persistentData.settings.audioInterface.outputChannels
		  )
		: devices.find((d) => d.isDefaultOutput);
	if (!savedDevice) savedDevice = devices.find((d) => d.isDefaultOutput);
	if (savedDevice) setAudioInterface(savedDevice);
}

function refreshCurrentAudioInterface() {
	setAudioInterface(currentAudioDevice);
}

function restartStream() {
	if (isStreamRunning) handleIpcMessage({ type: "stop" });
	sendMessage("refreshAfterDeviceChange");
}

// -----------------------------------------------------
// System update loop
// -----------------------------------------------------
function updateSystem() {
	updateNetworkInterfaces();
	refreshCurrentAudioInterface();
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
