// ipc/receiver.js
//
// Single entry point for messages coming from the main process.
import { bridge } from "./bridge";
import { useConfigStore } from "../stores/config";
import { useSessionStore } from "../stores/session";
import { useDiscoveryStore } from "../stores/discovery";
import { usePlaybackStore } from "../stores/playback";

export const startReceiver = () => {
	const config = useConfigStore();
	const session = useSessionStore();
	const discovery = useDiscoveryStore();
	const playback = usePlaybackStore();

	bridge.receive((message) => {
		switch (message.type) {
			case "streams":
				discovery.applyStreams(message.data);
				break;
			case "interfaces":
				discovery.networkInterfaces = message.data;
				break;
			case "audioDevices":
				discovery.audioDevices = message.data;
				break;
			case "updatePersistentData":
				config.applyFromMain(message.data);
				break;
			case "workerError":
				session.reportError(message.data);
				break;
			case "refreshAfterDeviceChange":
				playback.resume();
				break;
			default:
				console.log("Unhandled message from main:", message.type);
		}
	});

	// Ask main for the first system snapshot
	bridge.send({ type: "update" });
};
