// ipc/ipcHandler.js
const {
	getPersistentData,
	getPersistentDataForRenderer,
	setPersistentData,
	getUserData,
	setUserData,
	scheduleSavePersistentData,
	scheduleSaveUserData,
} = require("../persistence/persistence");
const {
	setAudioInterface,
	setPreferredAudioInterface,
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

module.exports.init = (sendMessage, saveWindow) => {
	sendMessageCallback = sendMessage;
	saveWindowStateCallback = saveWindow;
};

// Called again after a worker respawn, otherwise the captured references would
// point at a dead process and every send would silently go nowhere.
module.exports.setWorkers = (sdp, audio) => {
	sdpProcess = sdp;
	audioProcess = audio;
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
				sendMessageCallback(
					"updatePersistentData",
					getPersistentDataForRenderer(),
				);
			// updateSystem (main.js) is called externally after this
			sdpProcess?.send({ type: "update" });
			break;

		case "setAudioInterface":
			setAudioInterface(message.data);
			break;

		// The preferred device is main-owned, so the renderer asks rather than
		// writing it through the settings save, which would race the 300 ms
		// debounce. Pinning also clears followSystemAudio, and that one IS
		// renderer-owned, so the renderer has to learn about it before its own
		// next save pushes the old value back.
		case "setPreferredAudioInterface":
			setPreferredAudioInterface(message.data);
			if (sendMessageCallback)
				sendMessageCallback(
					"updatePersistentData",
					getPersistentDataForRenderer(),
				);
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
			if (isStreamRunning) audioProcess?.send({ type: "stop" });
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
							// Main-owned, for the same reason as `network` below: the
							// active device is resolved from the OS on a timer and the
							// preference changes through setPreferredAudioInterface. A
							// stale renderer copy would revert either of them, which is
							// how a pinned device would quietly lose its pin.
							audioInterface: persistentData.settings.audioInterface,
							storedAudioInterface:
								persistentData.settings.storedAudioInterface,
						},
						// Also main-owned: the interface list is re-derived from the
						// OS on a timer, and the selection changes via "setNetwork".
						// Accepting the renderer's copy here would let a stale
						// snapshot revert the selected interface.
						network: persistentData.network,
						devices:
							parsed.devices && typeof parsed.devices === "object"
								? parsed.devices
								: persistentData.devices,
						favorites: Array.isArray(parsed.favorites)
							? parsed.favorites
							: persistentData.favorites,
						streamNames:
							parsed.streamNames && typeof parsed.streamNames === "object"
								? parsed.streamNames
								: persistentData.streamNames,
						// Owned by the main process. The renderer is never sent the
						// hash, so trusting its copy here would wipe the password on
						// every save.
						passwordHash: persistentData.passwordHash,
						// Also main-owned: mirrored out of the discovery worker, so a
						// stale renderer copy must not win.
						manualStreams: persistentData.manualStreams,
					};
					// Never persist renderer-only state
					delete persistentData.adminMode;
					delete persistentData.hasPassword;

					sdpProcess?.send({
						type: "deleteTimeout",
						data: persistentData.settings.sdpDeleteTimeout,
					});
				} else if (
					message.key &&
					message.key !== "passwordHash" &&
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
