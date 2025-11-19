// config/paths.js
const path = require("node:path");
const { app } = require("electron/main");

// Shared (machine-wide) config
const persistentDir =
	process.platform === "win32"
		? path.join(process.env.ProgramData, "StreamMonitor")
		: path.join("/etc/StreamMonitor");
module.exports.persistentPath = path.join(persistentDir, "config.json");
module.exports.persistentDir = persistentDir;

// User config (AppData)
const userDir = path.join(app.getPath("appData"), "StreamMonitor");
module.exports.userPath = path.join(userDir, "user.json");
module.exports.userDir = userDir;

// Set user data path early
app.setPath("userData", path.join(userDir, "user_data"));
