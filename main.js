const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const fs = require("node:fs/promises"); // async fs
const crypto = require("crypto");
const os = require("os");
const { RtAudio, RtAudioApi } = require("audify");
const { fork } = require("child_process");

// ---------------------------
// Paths and config
// ---------------------------

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
	},
	network: { interfaces: [], currentInterface: "" },
	devices: [],
};

// Per-user data (UI state, favorites, etc.)
let userData = {
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
	favorites: [],
};

// ---------------------------
// Globals
// ---------------------------
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

// ---------------------------
// Helper: Send to renderer
// ---------------------------
function sendMessage(type, data) {
	if (mainWindow) {
		mainWindow.webContents.send("send-message", { type, data });
	}
}

// ---------------------------
// Async config load
// ---------------------------
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
				devices: { ...persistentData.devices, ...(data.devices || {}) },
			};
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
		}
	} catch (err) {
		console.error("Error loading userData:", err);
	}
}

// ---------------------------
// Async config save
// ---------------------------
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

	saveUserData();
}

async function savePersistentData() {
	try {
		await fs.mkdir(persistentDir, { recursive: true });
		await fs.writeFile(persistentPath, JSON.stringify(persistentData, null, 2));
	} catch (err) {
		console.error("Error saving persistentData:", err);
	}
}
// !!!!!!!!!!!!!!!!!!!!!!!!!
// !!!!!!!!!!!!!!!!!!!!!!!!!
// TODO:
// FRIENDLY NAMES WERDEN NICHT GESPEICHER

async function saveUserData() {
	try {
		await fs.mkdir(userDir, { recursive: true });
		await fs.writeFile(userPath, JSON.stringify(userData, null, 2));
	} catch (err) {
		console.error("Error saving userData:", err);
	}
}

// ---------------------------
// IPC Handlers
// ---------------------------
ipcMain.handle("get-shared-config", async () => ({
	persistentData,
	userData,
}));

ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));

// ---------------------------
// IPC message handling
// ---------------------------
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
				savePersistentData();
			}
			break;
		// Generic 'save' from renderer: message.key is a top-level key of persistentData
		case "save":
			try {
				const parsed = JSON.parse(message.data);
				// Only allow saving keys that are top-level members of persistentData
				if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;

					// React to special keys
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

					await savePersistentData();
				} else {
					console.warn("save: unknown persistentData key:", message.key);
				}
			} catch (err) {
				console.error("save: invalid JSON payload", err);
			}
			break;

		// Save entire or partial persistentData object — handle carefully to avoid nesting
		case "savePersistent":
			try {
				const parsed = JSON.parse(message.data);
				if (message.key === "persistentData") {
					// Replace/merge the root object (avoid creating persistentData.persistentData)
					// Merge shallow to keep default fields present
					persistentData = {
						...persistentData,
						...parsed,
						settings: {
							...persistentData.settings,
							...(parsed.settings || {}),
						},
						network: { ...persistentData.network, ...(parsed.network || {}) },
					};
				} else if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;
				} else {
					console.warn("savePersistent: unexpected key:", message.key);
				}
				await savePersistentData();
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
				await saveUserData();
			} catch (err) {
				console.error("saveUser: failed to parse or save", err);
			}
			break;

		case "setNetwork":
			if (persistentData.network.currentInterface !== message.data) {
				persistentData.network.currentInterface = message.dsata;
				savePersistentData();
			}
			break;

		case "saveWindow":
			saveWindowState(mainWindow);
			break;

		default:
			console.warn("Unknown IPC message type:", message.type);
	}
}

// ---------------------------
// Create Main Window
// ---------------------------
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
		autoHideMenuBar: false,
		show: false, // we show it only after ready-to-show
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

	// Block refresh
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

	ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));
}

// ---------------------------
// Lazy Initialization
// ---------------------------
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
			savePersistentData();
		}
	});

	// Restore saved audio interface
	restoreAudioInterface();

	// Start system update loop
	setInterval(updateSystem, 500);
}

// ---------------------------
// Network / Audio helpers
// ---------------------------
function updateNetworkInterfaces() {
	const interfaces = os.networkInterfaces();
	const addresses = [];

	for (const name of Object.keys(interfaces)) {
		for (const addr of interfaces[name]) {
			if (addr.family === "IPv4" && addr.address !== "127.0.0.1") {
				addr.name = name;
				addresses.push(addr);
			}
		}
	}

	persistentData.network = persistentData.network || {
		interfaces: [],
		currentInterface: "",
	};
	persistentData.network.interfaces = addresses.map((a) => ({
		name: a.name,
		address: a.address,
	}));

	let currentAddr = persistentData.network.currentInterface
		? addresses.find(
				(a) => a.address === persistentData.network.currentInterface
		  )
		: null;

	if (!currentAddr && addresses.length > 0) {
		currentAddr = addresses[0];
		persistentData.network.currentInterface = currentAddr.address;
	}

	if (currentAddr) {
		currentAddr.isCurrent = true;
		currentNetworkInterface = currentAddr;
	}

	networkInterfaces = addresses;
	savePersistentData();
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
	let found = false;

	for (const dev of devices) {
		if (!persistentData.settings.followSystemAudio) {
			if (
				device &&
				dev.name === device.name &&
				dev.inputChannels === device.inputChannels &&
				dev.outputChannels === device.outputChannels
			) {
				currentAudioDevice = dev;
				found = true;
				break;
			}
		}
	}

	if (!found) currentAudioDevice = defaultDevice;

	if (previousAudioDevice) {
		const changed =
			currentAudioDevice.name !== previousAudioDevice.name ||
			currentAudioDevice.id !== previousAudioDevice.id;
		if (changed) restartStream();
	}

	previousAudioDevice = currentAudioDevice;

	persistentData.settings.audioInterface = currentAudioDevice
		? {
				name: currentAudioDevice.name,
				inputChannels: currentAudioDevice.inputChannels,
				outputChannels: currentAudioDevice.outputChannels,
				id: currentAudioDevice.id,
		  }
		: null;

	savePersistentData();
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
	handleIpcMessage({ type: "stop" });
	sendMessage("refreshAfterDeviceChange");
}

// ---------------------------
// System update loop
// ---------------------------
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

// ---------------------------
// App lifecycle
// ---------------------------

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
	sdpProcess?.kill();
	audioProcess?.kill();
	app.quit();
});
