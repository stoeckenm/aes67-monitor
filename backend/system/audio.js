// system/audio.js
const { RtAudio, RtAudioApi } = require("audify");
const {
	getPersistentData,
	scheduleSavePersistentData,
} = require("../persistence/persistence");
const {
	sameDevice,
	resolveOutput,
	listForRenderer,
} = require("./audioSelection");

let rtAudio = null;
let audioAPI = RtAudioApi.UNSPECIFIED;
let currentAudioDevice = null;
let previousAudioDevice = null;
let requestedAudioDevice = null;
let selectionReason = "none";
let restartStreamCallback = null;
let sendMessageCallback = null;

// rtAudio.getDevices() is a blocking native enumeration. It used to run twice
// per call and this function was called every two seconds, so the device list
// was rebuilt four times a second for no reason. Results are cached and only
// refreshed when something asks for fresh data.
let deviceCache = null;
let deviceCacheTime = 0;
const DEVICE_CACHE_MS = 2000;
let lastDeviceSignature = "";
let lastReasonSignature = "";

function getDevices({ force = false } = {}) {
	if (!rtAudio) return [];
	const now = Date.now();
	if (!force && deviceCache && now - deviceCacheTime < DEVICE_CACHE_MS) {
		return deviceCache;
	}
	try {
		deviceCache = rtAudio.getDevices();
	} catch (err) {
		console.error("Could not enumerate audio devices:", err);
		deviceCache = deviceCache || [];
	}
	deviceCacheTime = now;
	return deviceCache;
}

module.exports.invalidateDeviceCache = () => {
	deviceCache = null;
};

module.exports.initAudio = (sendMessage, restartStream) => {
	sendMessageCallback = sendMessage;
	restartStreamCallback = restartStream;

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
		default:
			// Fallback for other systems
			audioAPI = RtAudioApi.UNSPECIFIED;
	}
	rtAudio = new RtAudio(audioAPI);
	module.exports.audioAPI = audioAPI; // Export for use in ipcHandler
};

function identify(device) {
	if (!device) return null;
	return {
		name: device.name,
		inputChannels: device.inputChannels,
		outputChannels: device.outputChannels,
		id: device.id,
	};
}

// Only push to the renderer when the list or the selection actually changed;
// this used to fire every two seconds regardless.
function publishAudioInterfaces(devices, pinned) {
	if (!sendMessageCallback) return;
	const usable = listForRenderer({
		devices,
		pinned,
		current: currentAudioDevice,
	});

	const signature = JSON.stringify(
		usable.map((d) => [
			d.name,
			d.inputChannels,
			d.outputChannels,
			d.isDefaultOutput,
			d.isDefaultInput,
			d.isCurrent,
			d.isPinned,
			d.absent,
		]),
	);
	if (signature !== lastDeviceSignature) {
		lastDeviceSignature = signature;
		sendMessageCallback("audioDevices", usable);
	}

	// Why that device is in use is decided here and only here. The renderer
	// states it in words rather than deriving the precedence a second time,
	// which is how the two would drift apart.
	const reasonSignature = `${selectionReason}|${currentAudioDevice?.name || ""}`;
	if (reasonSignature !== lastReasonSignature) {
		lastReasonSignature = reasonSignature;
		sendMessageCallback("audioSelection", {
			reason: selectionReason,
			name: currentAudioDevice?.name || "",
		});
	}
}

module.exports.setAudioInterface = (device, { force = false } = {}) => {
	if (!rtAudio) return;
	const persistentData = getPersistentData();
	const devices = getDevices({ force });
	if (devices.length === 0) return;

	// Any device handed in here is a deliberate choice: the system loop calls
	// refreshCurrentAudioInterface() with null. Remembering it is what lets an
	// unplugged pin fall back to this choice instead of to the system default.
	if (device) requestedAudioDevice = identify(device);

	const pinned = persistentData.settings.storedAudioInterface;
	const { device: selected, reason } = resolveOutput({
		devices,
		pinned,
		requested: requestedAudioDevice,
		followSystem: persistentData.settings.followSystemAudio,
	});

	const changed = !sameDevice(selected, previousAudioDevice);
	currentAudioDevice = selected;
	selectionReason = reason;

	if (previousAudioDevice && changed && restartStreamCallback) {
		restartStreamCallback();
	}
	previousAudioDevice = selected;

	// Persist only on a real change; this ran a full JSON.stringify of the
	// config on every tick before.
	const next = identify(selected);
	const current = persistentData.settings.audioInterface;
	if (JSON.stringify(next) !== JSON.stringify(current)) {
		persistentData.settings.audioInterface = next;
		scheduleSavePersistentData();
	}

	publishAudioInterfaces(devices, pinned);
};

// The preference is main-owned, like the network selection: the renderer asks
// for a change and reads the result back from the pushed config. Writing it
// through the ordinary settings save would race the 300 ms debounce, so the
// device switch would happen before main knew about the new pin.
module.exports.setPreferredAudioInterface = (device) => {
	const persistentData = getPersistentData();
	const pinned = identify(device);
	persistentData.settings.storedAudioInterface = pinned;
	// Pinning a device and following the system default are contradictory
	// wishes, and following the system silently wins. Choosing a device is the
	// more specific instruction, so it turns the other one off.
	if (pinned) persistentData.settings.followSystemAudio = false;
	scheduleSavePersistentData();
	module.exports.setAudioInterface(device || currentAudioDevice, {
		force: true,
	});
};

module.exports.restoreAudioInterface = () => {
	if (!rtAudio) return;
	const devices = getDevices({ force: true });
	const persistentData = getPersistentData();
	const saved = persistentData.settings.audioInterface;
	// The saved device is the manual choice to restore. The pin, if any, wins
	// over it inside setAudioInterface.
	requestedAudioDevice = saved || null;
	const savedDevice =
		(saved && devices.find((d) => sameDevice(d, saved))) ||
		devices.find((d) => d.isDefaultOutput);
	if (savedDevice) module.exports.setAudioInterface(savedDevice);
};

module.exports.refreshCurrentAudioInterface = (options) =>
	module.exports.setAudioInterface(null, options);

module.exports.getCurrentAudioDevice = () => currentAudioDevice;
module.exports.getSelectionReason = () => selectionReason;
