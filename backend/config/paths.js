// config/paths.js
const path = require("node:path");
const fs = require("node:fs");
const { app } = require("electron/main");

function isWritable(dir) {
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.accessSync(dir, fs.constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

// Machine-wide config, shared by all users of the machine. The previous
// /etc/StreamMonitor required root on macOS and Linux, so saving silently
// failed for ordinary users; fall back to a per-user directory there.
function resolvePersistentDir() {
	const candidates = [];

	if (process.platform === "win32") {
		const programData = process.env.ProgramData || "C:\\ProgramData";
		candidates.push(path.join(programData, "StreamMonitor"));
	} else if (process.platform === "darwin") {
		candidates.push("/Library/Application Support/StreamMonitor");
	} else {
		candidates.push("/etc/StreamMonitor");
	}

	// Last resort, always writable by the current user
	const perUser = path.join(app.getPath("appData"), "StreamMonitor", "shared");
	candidates.push(perUser);

	for (const dir of candidates) {
		if (isWritable(dir)) return dir;
	}
	return perUser;
}

const persistentDir = resolvePersistentDir();
module.exports.persistentPath = path.join(persistentDir, "config.json");
module.exports.persistentDir = persistentDir;

// User config (AppData)
const userDir = path.join(app.getPath("appData"), "StreamMonitor");
module.exports.userPath = path.join(userDir, "user.json");
module.exports.userDir = userDir;

// Set user data path early
app.setPath("userData", path.join(userDir, "user_data"));
