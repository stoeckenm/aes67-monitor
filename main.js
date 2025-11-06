const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("crypto");
const os = require("os");
const { RtAudio, RtAudioApi } = require("audify");
const { fork } = require("child_process");
const { log } = require("node:console");

// ---------------------------
// Paths and config
// ---------------------------
const configDir =
	process.platform === "win32"
		? path.join(process.env.ProgramData, "StreamMonitor")
		: path.join(app.getPath("userData"), "StreamMonitor");

fs.mkdirSync(configDir, { recursive: true });
const configPath = path.join(configDir, "config.json");

// Store user_data separately for cache etc.
app.setPath("userData", path.join(__dirname, "user_data"));

// ---------------------------
// Default persistentData
// ---------------------------
let persistentData = {
	settings: {
		bufferSize: 16,
		bufferEnabled: true,
		hideUnsupported: true,
		sdpDeleteTimeout: 300,
		sidebarCollapsed: false,
		followSystemAudio: true,
		audioInterface: null, // <-- saved audio device
	},
	network: {
		interfaces: [],
		currentInterface: "",
	},
	favorites: [],
	devices: [],
};

// At the top, after imports and persistentData is initialized
ipcMain.handle("get-shared-config", async () => {
	// Always return the latest persistentData
	return persistentData;
});

// ---------------------------
// Load config from disk
// ---------------------------
try {
	if (fs.existsSync(configPath)) {
		const data = fs.readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(data);

		// Merge loaded config with defaults to ensure all keys exist
		persistentData = {
			settings: { ...persistentData.settings, ...(parsed.settings || {}) },
			network: { ...persistentData.network, ...(parsed.network || {}) },
			favorites: parsed.favorites || persistentData.favorites,
			devices: parsed.devices || persistentData.devices,
		};
	} else {
		fs.writeFileSync(configPath, JSON.stringify(persistentData, null, 2));
	}
} catch (err) {
	console.error("Error loading config:", err);
}

// ---------------------------
// Save helper
// ---------------------------
function saveConfig() {
	try {
		fs.writeFileSync(configPath, JSON.stringify(persistentData, null, 2));
	} catch (err) {
		console.error("Error saving config:", err);
	}
}

// ---------------------------
// Global variables
// ---------------------------
let mainWindow;
let networkInterfaces = [];
let currentNetworkInterface = null;
let currentAudioDevice = null;
let audioAPI = RtAudioApi.UNSPECIFIED;
let isSDPInitialized = false;
let streamsHash = null;
let currentPlayArgs = null;
let previousAudioDevice = null;

// ---------------------------
// Set audio API based on OS
// ---------------------------
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

const rtAudio = new RtAudio(audioAPI);

// ---------------------------
// Spawn child processes
// ---------------------------
const sdpProcess = fork(path.join(__dirname, "./src/lib/sdp.js"));
const audioProcess = fork(path.join(__dirname, "./src/lib/audio.js"));

// ---------------------------
// Main window
// ---------------------------
function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1920,
		height: 1080,
		autoHideMenuBar: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (app.isPackaged) {
		mainWindow.loadFile("./dist/index.html");
		mainWindow.webContents.on("before-input-event", (event, input) => {
			if (
				(input.key.toLowerCase() === "r" && (input.control || input.meta)) ||
				input.key === "F5"
			) {
				event.preventDefault();
			}
		});
	} else {
		mainWindow.loadURL("http://localhost:8888");
	}

	ipcMain.on("recv-message", (event, message) => handleIpcMessage(message));
}

// ---------------------------
// IPC message handling
// ---------------------------
function handleIpcMessage(message) {
	switch (message.type) {
		case "update":
			sendMessage("updatePersistentData", persistentData);
			updateSystem();
			sdpProcess.send({ type: "update" });
			break;

		case "setAudioInterface":
			setAudioInterface(message.data);
			break;

		case "restart":
			refreshCurrentAudioInterface();
			audioProcess.send({
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
				audioAPI: audioAPI,
				networkInterface: currentNetworkInterface?.address || "",
				selected: currentAudioDevice,
			};
			audioProcess.send({ type: "start", data: currentPlayArgs });
			break;

		case "stop":
			audioProcess.send({ type: "stop" });
			break;

		case "addStream":
			sdpProcess.send({ type: "add", data: message.data });
			break;

		case "delete":
			sdpProcess.send({ type: "delete", data: message.data });
			break;

		case "setNetwork":
			if (currentNetworkInterface?.address !== message.data) {
				console.log("Got new network interface", message.data);
				persistentData.network.currentInterface = message.data;
				updateNetworkInterfaces();
				audioProcess.send({ type: "stop" });
				sdpProcess.send({ type: "interface", data: message.data });
				saveConfig();
			}
			break;

		case "save":
			if (message.key && persistentData.hasOwnProperty(message.key)) {
				persistentData[message.key] = JSON.parse(message.data);

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
					sdpProcess.send({
						type: "deleteTimeout",
						data: persistentData.settings.sdpDeleteTimeout,
					});
				}

				saveConfig();
			} else {
				console.warn("Unknown key for save:", message.key);
			}
			break;

		default:
			console.log("Unknown IPC message type:", message.type, message.data);
	}
}

// ---------------------------
// Send messages to renderer
// ---------------------------
function sendMessage(type, data) {
	if (mainWindow) {
		try {
			mainWindow.webContents.send("send-message", { type, data });
		} catch (err) {
			console.error("Error sending message:", err);
		}
	}
}

// ---------------------------
// Network interface management
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

	// Ensure network object exists
	persistentData.network = persistentData.network || {
		interfaces: [],
		currentInterface: "",
	};

	persistentData.network.interfaces = addresses.map((a) => ({
		name: a.name,
		address: a.address,
	}));

	// Determine current interface
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
	saveConfig();
}

// ---------------------------
// Audio interface management
// ---------------------------
function updateAudioInterfaces() {
	let devices = rtAudio.getDevices();
	devices = devices.filter((d) => d.inputChannels > 0 || d.outputChannels > 0);

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

	// Save to persistentData
	persistentData.settings.audioInterface = currentAudioDevice
		? {
				name: currentAudioDevice.name,
				inputChannels: currentAudioDevice.inputChannels,
				outputChannels: currentAudioDevice.outputChannels,
				id: currentAudioDevice.id,
		  }
		: null;

	saveConfig();
	updateAudioInterfaces();
}

function restartStream() {
	handleIpcMessage({ type: "stop" });
	sendMessage("refreshAfterDeviceChange");
}

function refreshCurrentAudioInterface() {
	setAudioInterface(currentAudioDevice);
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
		sdpProcess.send({ type: "init", data: currentNetworkInterface.address });
		sdpProcess.send({
			type: "deleteTimeout",
			data: persistentData.settings.sdpDeleteTimeout,
		});
	}

	sendMessage("interfaces", networkInterfaces);
}

// ---------------------------
// SDP child process
// ---------------------------
sdpProcess.on("message", (data) => {
	sendMessage("streams", data);

	const combinedRaw = data.map((s) => (s.manual ? s.raw : "")).join("");
	const newHash = crypto.createHash("sha256").update(combinedRaw).digest("hex");

	if (newHash !== streamsHash) {
		streamsHash = newHash;
		saveConfig();
	}
});

// ---------------------------
// App ready
// ---------------------------
app.whenReady().then(() => {
	createMainWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

// ---------------------------
// App close
// ---------------------------
app.on("window-all-closed", () => {
	sdpProcess.kill();
	audioProcess.kill();
	app.quit();
});

// ---------------------------
// Restore audio interface from persistentData
// ---------------------------
(function restoreAudioInterface() {
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
})();

// ---------------------------
// Start periodic updates
// ---------------------------
setInterval(updateSystem, 500);
