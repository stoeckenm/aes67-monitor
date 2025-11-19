// renderer/app.js
// Entrypoint for the Vue/Renderer application

import { loadSharedConfig, setupConfigWatchers } from "./store/config";
import { initIpcReceiver } from "./store/ipc";

// Export all state and actions for use in Vue components
export * from "./store/state";
export * from "./store/actions";
export * from "./store/config";
export * from "./store/ipc";

// Auto-load on startup
loadSharedConfig().then(() => {
	// Setup watchers only after config is loaded
	setupConfigWatchers();
	initIpcReceiver(); // Initialize IPC receiver to listen for updates
});
