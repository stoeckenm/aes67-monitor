// renderer/app.js
// Entrypoint for the Vue/Renderer application

import { loadSharedConfig, setupConfigWatchers } from "./store/config";
import { initIpcReceiver, setResumePlaybackHandler } from "./store/ipc";
import { playStream } from "./store/actions";

// Export all state and actions for use in Vue components
export * from "./store/state";
export * from "./store/actions";
export * from "./store/config";
export * from "./store/ipc";
export * from "./store/favorites";
export * from "./store/settings";

// Auto-load on startup
loadSharedConfig().then(() => {
	// Setup watchers only after config is loaded
	setupConfigWatchers();
	// Injected here rather than imported inside ipc.js, which would create a
	// cycle between ipc and actions.
	setResumePlaybackHandler(playStream);
	initIpcReceiver(); // Initialize IPC receiver to listen for updates
});
