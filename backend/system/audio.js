// system/audio.js
const { RtAudio, RtAudioApi } = require("audify");
const {
	getPersistentData,
	scheduleSavePersistentData,
} = require("../persistence/persistence");

let rtAudio = null;
let audioAPI = RtAudioApi.UNSPECIFIED;
let currentAudioDevice = null;
let previousAudioDevice = null;
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

// Matching is by name plus channel counts, never by id: RtAudio ids shift when
// devices come and go.
function sameDevice(a, b) {
	if (!a || !b) return false;
	return (
		a.name === b.name &&
		a.inputChannels === b.inputChannels &&
		a.outputChannels === b.outputChannels
	);
}

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
function publishAudioInterfaces(devices) {
	if (!sendMessageCallback) return;
	const usable = devices
		.filter((d) => d.inputChannels > 0 || d.outputChannels > 0)
		.map((d) => ({ ...d, isCurrent: sameDevice(d, currentAudioDevice) }));

	const signature = JSON.stringify(
		usable.map((d) => [
			d.name,
			d.inputChannels,
			d.outputChannels,
			d.isDefaultOutput,
			d.isDefaultInput,
			d.isCurrent,
		]),
	);
	if (signature === lastDeviceSignature) return;
	lastDeviceSignature = signature;
	sendMessageCallback("audioDevices", usable);
}

module.exports.setAudioInterface = (device, { force = false } = {}) => {
	if (!rtAudio) return;
	const persistentData = getPersistentData();
	const devices = getDevices({ force });
	if (devices.length === 0) return;

	const defaultDevice = devices.find((d) => d.isDefaultOutput);
	const storedDevice = persistentData.settings.storedAudioInterface;
	const followSystem = persistentData.settings.followSystemAudio;
	let selected = null;

	if (!followSystem) {
		// A pinned device wins over whatever was passed in
		selected =
			devices.find((d) => sameDevice(d, storedDevice)) ||
			devices.find((d) => sameDevice(d, device)) ||
			null;
	}
	if (!selected) selected = defaultDevice || null;

	const changed = !sameDevice(selected, previousAudioDevice);
	currentAudioDevice = selected;

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

	publishAudioInterfaces(devices);
};

module.exports.restoreAudioInterface = () => {
	if (!rtAudio) return;
	const devices = getDevices({ force: true });
	const persistentData = getPersistentData();
	const saved = persistentData.settings.audioInterface;
	const savedDevice =
		(saved && devices.find((d) => sameDevice(d, saved))) ||
		devices.find((d) => d.isDefaultOutput);
	if (savedDevice) module.exports.setAudioInterface(savedDevice);
};

module.exports.refreshCurrentAudioInterface = (options) =>
	module.exports.setAudioInterface(currentAudioDevice, options);

module.exports.getCurrentAudioDevice = () => currentAudioDevice;
