// renderer/store/ipc.js
import {
	playing,
	persistentData,
	streams,
	favorites,
	devices,
	networkInterfaces,
	audioInterfaces,
	currentStream,
	favoriteCount,
	streamCount,
	interfaceCount,
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

export const initIpcReceiver = () => {
	if (!window.electronAPI) {
		console.warn("Running outside Electron, IPC receiver skipped.");
		return;
	}

	window.electronAPI.recvMessage((message) => {
		switch (message.type) {
			case "favorites":
				favorites.value = message.data;
				favoriteCount.value = message.data.length;
				break;
			case "streams":
				streams.value = message.data;
				streamCount.value = message.data.length;
				break;
			case "devices":
				devices.value = message.data;
				break;
			case "interfaces":
				networkInterfaces.value = message.data;
				break;
			case "audioDevices":
				audioInterfaces.value = message.data;
				interfaceCount.value = message.data.length;
				break;
			case "updatePersistentData":
				// Apply from main without triggering a save ping-pong
				applyingFromMain = true;
				persistentData.value = message.data;
				applyingFromMain = false;
				break;
			case "refreshAfterDeviceChange":
				console.log("refresh after device change");
				playing.value = "";
				if (currentStream.value) {
					// Lazy import to avoid circular dependency in Vue Store setup
					const { playStream } = require("./actions");
					playStream(currentStream.value);
				}
				break;
			default:
				console.log(message.type, message.data);
		}
	});

	// Initial system update request
	sendMessage({ type: "update" });
};
