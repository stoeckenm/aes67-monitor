// ipc/bridge.js
//
// The single place that touches window.electronAPI. Everything else talks to
// this, which also keeps the stores testable outside Electron.
const api = () => (typeof window !== "undefined" ? window.electronAPI : null);

export const bridge = {
	available: () => !!api(),

	send(message) {
		const electronAPI = api();
		if (!electronAPI?.sendMessage) {
			console.warn("No Electron bridge, dropping message:", message.type);
			return;
		}
		// Structured clone over IPC cannot carry Vue proxies
		electronAPI.sendMessage(JSON.parse(JSON.stringify(message)));
	},

	receive(handler) {
		const electronAPI = api();
		if (!electronAPI?.recvMessage) return;
		electronAPI.recvMessage(handler);
	},

	async getSharedConfig() {
		const electronAPI = api();
		if (!electronAPI?.getSharedConfig) return null;
		return electronAPI.getSharedConfig();
	},

	async verifyAdminPassword(password) {
		const electronAPI = api();
		if (!electronAPI?.verifyAdminPassword) return { ok: false };
		return electronAPI.verifyAdminPassword(password);
	},

	async setAdminPassword(password) {
		const electronAPI = api();
		if (!electronAPI?.setAdminPassword) return { hasPassword: false };
		return electronAPI.setAdminPassword(password);
	},
};
