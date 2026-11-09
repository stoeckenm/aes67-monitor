// persistence/persistence.js
const fs = require("node:fs/promises");
const path = require("node:path");
const {
	persistentPath,
	persistentDir,
	userPath,
	userDir,
} = require("../config/paths");
const {
	persistentDataDefaults,
	userDataDefaults,
} = require("../config/defaults");
const { mergePersistent, mergeUser, forRenderer } = require("./migrate");

let persistentData = structuredClone(persistentDataDefaults);
let userData = structuredClone(userDataDefaults);
let lastSavedJSON = "";
let lastUserSavedJSON = "";
let saveTimer = null;
let saveUserTimer = null;
let lastWriteError = null;

async function writeAtomic(filePath, data, dirToEnsure) {
	const tmp = `${filePath}.tmp`;
	await fs.mkdir(dirToEnsure, { recursive: true });
	await fs.writeFile(tmp, data);
	await fs.rename(tmp, filePath);
}

// The machine-wide config lives in a directory the user may not be allowed to
// write to. Surface that instead of silently losing every setting.
module.exports.getLastWriteError = () => lastWriteError;

function scheduleSave(kind, timeout = 300) {
	const isPersistent = kind === "persistent";
	const filePath = isPersistent ? persistentPath : userPath;
	const dirToEnsure = isPersistent ? persistentDir : userDir;

	const run = async () => {
		try {
			const json = JSON.stringify(
				isPersistent ? persistentData : userData,
				null,
				2,
			);
			const previous = isPersistent ? lastSavedJSON : lastUserSavedJSON;
			if (json === previous) return;

			await writeAtomic(filePath, json, dirToEnsure);
			if (isPersistent) lastSavedJSON = json;
			else lastUserSavedJSON = json;
			lastWriteError = null;
		} catch (err) {
			lastWriteError = { path: filePath, message: err.message };
			console.error(`Error saving ${path.basename(filePath)}:`, err);
		}
	};

	if (isPersistent) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(run, timeout);
	} else {
		clearTimeout(saveUserTimer);
		saveUserTimer = setTimeout(run, timeout);
	}
}

module.exports.scheduleSavePersistentData = () => scheduleSave("persistent");
module.exports.scheduleSaveUserData = () => scheduleSave("user");

async function loadData(filePath, dirToEnsure, merge, fallback) {
	try {
		await fs.mkdir(dirToEnsure, { recursive: true });
		const raw = await fs.readFile(filePath, "utf-8").catch((err) => {
			if (err.code === "ENOENT") return null;
			throw err;
		});

		if (raw === null) {
			return { data: fallback, json: JSON.stringify(fallback, null, 2) };
		}

		const stored = JSON.parse(raw);
		const { merged: data, changed } = merge(stored);

		if (changed) {
			// Keep a copy before the first migrating write, so a downgrade has
			// something to fall back to.
			await fs
				.copyFile(filePath, `${filePath}.bak`)
				.catch((err) => console.error("Could not write config backup:", err));
		}

		return {
			data,
			// Seed the comparison value so loading does not trigger a rewrite,
			// unless a migration actually changed something.
			json: changed ? "" : JSON.stringify(data, null, 2),
		};
	} catch (err) {
		console.error(`Error loading ${path.basename(filePath)}:`, err);
		return { data: fallback, json: "" };
	}
}

module.exports.loadPersistentData = async () => {
	const { data, json } = await loadData(
		persistentPath,
		persistentDir,
		mergePersistent,
		structuredClone(persistentDataDefaults),
	);
	persistentData = data;
	lastSavedJSON = json;
	if (!json) scheduleSave("persistent");
	return persistentData;
};

module.exports.loadUserData = async () => {
	const { data, json } = await loadData(
		userPath,
		userDir,
		mergeUser,
		structuredClone(userDataDefaults),
	);
	userData = data;
	lastUserSavedJSON = json;
	return userData;
};

module.exports.getPersistentData = () => persistentData;
module.exports.getUserData = () => userData;
module.exports.setPersistentData = (data) => (persistentData = data);
module.exports.setUserData = (data) => (userData = data);

module.exports.getPersistentDataForRenderer = () => forRenderer(persistentData);
