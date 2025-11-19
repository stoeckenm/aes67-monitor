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

function updateAudioInterfaces() {
	if (!rtAudio || !sendMessageCallback) return;
	const devices = rtAudio
		.getDevices()
		.filter((d) => d.inputChannels > 0 || d.outputChannels > 0);
	devices.forEach((d) => (d.isCurrent = currentAudioDevice?.id === d.id));
	sendMessageCallback("audioDevices", devices);
}

module.exports.setAudioInterface = (device) => {
	if (!rtAudio) return;
	const persistentData = getPersistentData();
	const devices = rtAudio.getDevices();
	let defaultDevice = devices.find((d) => d.isDefaultOutput);
	let storedDevice = persistentData.settings.storedAudioInterface;
	let found = false;

	// 1. Try to use stored device first (if followSystemAudio is false)
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

	// 2. If no stored device found, use the passed device (if followSystemAudio is false)
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

	// 3. Fallback to default if followSystemAudio is true or nothing else found
	if (!found || persistentData.settings.followSystemAudio) {
		currentAudioDevice = defaultDevice;
	}

	// Restart stream if device changed
	if (previousAudioDevice) {
		const changed =
			currentAudioDevice?.name !== previousAudioDevice?.name ||
			currentAudioDevice?.id !== previousAudioDevice?.id;
		if (changed && restartStreamCallback) restartStreamCallback();
	}
	previousAudioDevice = currentAudioDevice;

	// Save current selection to persistentData (used for re-launch)
	persistentData.settings.audioInterface = currentAudioDevice
		? {
				name: currentAudioDevice.name,
				inputChannels: currentAudioDevice.inputChannels,
				outputChannels: currentAudioDevice.outputChannels,
				id: currentAudioDevice.id,
		  }
		: null;

	scheduleSavePersistentData();
	updateAudioInterfaces();
};

module.exports.restoreAudioInterface = () => {
	if (!rtAudio) return;
	const devices = rtAudio.getDevices();
	const persistentData = getPersistentData();
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
	if (savedDevice) module.exports.setAudioInterface(savedDevice);
};

module.exports.refreshCurrentAudioInterface = () =>
	module.exports.setAudioInterface(currentAudioDevice);

module.exports.getCurrentAudioDevice = () => currentAudioDevice;
