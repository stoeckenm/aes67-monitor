const { contextBridge, ipcRenderer } = require("electron/renderer");

contextBridge.exposeInMainWorld("electronAPI", {
	recvMessage: (callback) =>
		ipcRenderer.on("send-message", (_event, value) => callback(value)),
	sendMessage: (message) => ipcRenderer.send("recv-message", message),
	getSharedConfig: () => ipcRenderer.invoke("get-shared-config"),
	saveSharedConfig: (config) => ipcRenderer.send("save-shared-config", config),
});
