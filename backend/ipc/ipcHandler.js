// ipc/ipcHandler.js
const {
	getPersistentData,
	setPersistentData,
	getUserData,
	setUserData,
	scheduleSavePersistentData,
	scheduleSaveUserData,
} = require("../persistence/persistence");
const {
	setAudioInterface,
	refreshCurrentAudioInterface,
	getCurrentAudioDevice,
} = require("../system/audio");
const {
	updateNetworkInterfaces,
	getCurrentNetworkInterface,
} = require("../system/network");
const {
	persistentDataDefaults,
	userDataDefaults,
} = require("../config/defaults"); // Import defaults for merging

let sdpProcess = null;
let audioProcess = null;
let sendMessageCallback = null;
let saveWindowStateCallback = null;
let isStreamRunning = false;
let currentPlayArgs = null;

module.exports.init = (sdp, audio, sendMessage, saveWindow) => {
	sdpProcess = sdp;
	audioProcess = audio;
	sendMessageCallback = sendMessage;
	saveWindowStateCallback = saveWindow;
};

module.exports.setIsStreamRunning = (status) => {
	isStreamRunning = status;
};

module.exports.handleIpcMessage = async (message) => {
	let persistentData = getPersistentData();
	let userData = getUserData();
	const currentNetworkInterface = getCurrentNetworkInterface();
	const currentAudioDevice = getCurrentAudioDevice();

	switch (message.type) {
		case "update":
			if (sendMessageCallback)
				sendMessageCallback("updatePersistentData", persistentData);
			// updateSystem (main.js) is called externally after this
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
				audioAPI: require("../system/audio").audioAPI, // Access exported audioAPI
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
				setPersistentData(persistentData); // Update global state
				updateNetworkInterfaces(); // This updates currentNetworkInterface globally
				audioProcess?.send({ type: "stop" });
				sdpProcess?.send({ type: "interface", data: message.data });
				scheduleSavePersistentData();
			}
			break;

		// Generic 'save' from renderer (not used in refactoring, but kept for compatibility)
		case "save":
			try {
				const parsed = JSON.parse(message.data);
				if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;

					if (message.key === "settings") {
						if (sdpProcess) {
							sdpProcess.send({
								type: "deleteTimeout",
								data: persistentData.settings.sdpDeleteTimeout,
							});
						}
					}
					setPersistentData(persistentData);
					scheduleSavePersistentData();
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
					persistentData = {
						...persistentDataDefaults, // Ensure defaults are preserved for missing keys
						...parsed,
						settings: {
							...persistentDataDefaults.settings,
							...(parsed.settings || {}),
						},
						network: {
							...persistentDataDefaults.network,
							...(parsed.network || {}),
						},
						devices: Array.isArray(parsed.devices)
							? parsed.devices
							: persistentDataDefaults.devices,
						favorites: Array.isArray(parsed.favorites)
							? parsed.favorites
							: persistentDataDefaults.favorites,
					};
				} else if (
					message.key &&
					Object.prototype.hasOwnProperty.call(persistentData, message.key)
				) {
					persistentData[message.key] = parsed;
				} else {
					console.warn("savePersistent: unexpected key:", message.key);
				}
				setPersistentData(persistentData);
				scheduleSavePersistentData();
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
						...userDataDefaults,
						...parsed,
						settings: {
							...userDataDefaults.settings,
							...(parsed.settings || {}),
						},
					};
				} else if (
					message.key &&
					Object.prototype.hasOwnProperty.call(userData, message.key)
				) {
					userData[message.key] = parsed;
				} else {
					console.warn("saveUser: unexpected key:", message.key);
				}
				setUserData(userData);
				scheduleSaveUserData();
			} catch (err) {
				console.error("saveUser: failed to parse or save", err);
			}
			break;

		case "saveWindow":
			if (saveWindowStateCallback) saveWindowStateCallback();
			break;

		case "playingStatus":
			module.exports.setIsStreamRunning(message.data.isPlaying); // Update local status
			break;

		default:
			console.warn("Unknown IPC message type:", message.type);
	}
};
