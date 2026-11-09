// Runs in a sandboxed preload, where require() only resolves "electron" and a
// few polyfilled builtins - the "electron/renderer" subpath is not available.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	recvMessage: (callback) =>
		ipcRenderer.on("send-message", (_event, value) => callback(value)),
	sendMessage: (message) => ipcRenderer.send("recv-message", message),
	getSharedConfig: () => ipcRenderer.invoke("get-shared-config"),
	verifyAdminPassword: (password) =>
		ipcRenderer.invoke("verify-admin-password", password),
	setAdminPassword: (password) =>
		ipcRenderer.invoke("set-admin-password", password),
});
