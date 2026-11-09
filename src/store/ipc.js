// renderer/store/ipc.js
import {
	playing,
	persistentData,
	streams,
	streamCount,
	networkInterfaces,
	audioInterfaces,
	currentStream,
	lastError,
} from "./state";

let applyingFromMain = false; // Prevents save ping-pong

export const isApplyingFromMain = () => applyingFromMain;
export const setApplyingFromMain = (status) => (applyingFromMain = status);

export const sendMessage = (message) => {
	if (window?.electronAPI?.sendMessage) {
		// Use structuredClone or deep copy to ensure safe passing
		const safeMessage = JSON.parse(JSON.stringify(message));
		window.electronAPI.sendMessage(safeMessage);
	} else {
		console.error("Cannot send message to Electron backend!");
	}
};

// Set by app.js after the stores are wired, to avoid importing actions here
// (that import cycle previously needed a CommonJS require()).
let resumePlayback = null;
export const setResumePlaybackHandler = (handler) => {
	resumePlayback = handler;
};

export const initIpcReceiver = () => {
	if (!window.electronAPI) {
		console.warn("Running outside Electron, IPC receiver skipped.");
		return;
	}

	window.electronAPI.recvMessage((message) => {
		switch (message.type) {
			case "streams":
				streams.value = message.data;
				streamCount.value = message.data.length;
				break;
			case "interfaces":
				networkInterfaces.value = message.data;
				break;
			case "audioDevices":
				audioInterfaces.value = message.data;
				break;
			case "updatePersistentData":
				// Apply from main without triggering a save ping-pong
				applyingFromMain = true;
				persistentData.value = message.data;
				applyingFromMain = false;
				break;
			case "workerError":
				lastError.value = message.data;
				console.error("[worker]", message.data);
				break;
			case "refreshAfterDeviceChange":
				playing.value = "";
				if (currentStream.value && resumePlayback) {
					resumePlayback(currentStream.value);
				}
				break;
			default:
				console.log(message.type, message.data);
		}
	});

	// Initial system update request
	sendMessage({ type: "update" });
};
