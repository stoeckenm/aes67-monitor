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

let persistentData = { ...persistentDataDefaults };
let userData = { ...userDataDefaults };
let lastSavedJSON = "";
let lastUserSavedJSON = "";
let saveTimer = null;
let saveUserTimer = null;

async function writeAtomic(filePath, data, dirToEnsure) {
	const tmp = `${filePath}.tmp`;
	await fs.mkdir(dirToEnsure, { recursive: true });
	await fs.writeFile(tmp, data);
	await fs.rename(tmp, filePath);
}

function scheduleSave(
	filePath,
	dataObj,
	lastSavedVar,
	dirToEnsure,
	saveKey,
	timeout = 300
) {
	clearTimeout(saveKey);
	saveKey = setTimeout(async () => {
		try {
			const json = JSON.stringify(dataObj, null, 2);
			if (
				json !==
				(filePath === persistentPath ? lastSavedJSON : lastUserSavedJSON)
			) {
				await writeAtomic(filePath, json, dirToEnsure);
				// Update the tracking variable *after* a successful save
				if (filePath === persistentPath) {
					lastSavedJSON = json;
				} else if (filePath === userPath) {
					lastUserSavedJSON = json;
				}
			}
		} catch (err) {
			console.error(`Error saving ${path.basename(filePath)}:`, err);
		}
	}, timeout);
	return saveKey;
}

module.exports.scheduleSavePersistentData = () => {
	saveTimer = scheduleSave(
		persistentPath,
		persistentData,
		lastSavedJSON,
		persistentDir,
		saveTimer
	);
};

module.exports.scheduleSaveUserData = () => {
	saveUserTimer = scheduleSave(
		userPath,
		userData,
		lastUserSavedJSON,
		userDir,
		saveUserTimer
	);
};

async function loadData(filePath, defaults, initialData, isPersistent = true) {
	try {
		const dirToEnsure = isPersistent ? persistentDir : userDir;
		await fs.mkdir(dirToEnsure, { recursive: true });
		const exists = await fs
			.access(filePath)
			.then(() => true)
			.catch(() => false);

		if (exists) {
			const data = JSON.parse(await fs.readFile(filePath, "utf-8"));
			const merged = {
				...initialData,
				...data,
				settings: { ...initialData.settings, ...(data.settings || {}) },
				network: { ...initialData.network, ...(data.network || {}) },
				devices: Array.isArray(data.devices)
					? data.devices
					: initialData.devices,
				favorites: Array.isArray(data.favorites)
					? data.favorites
					: initialData.favorites,
			};

			// Seed the last saved JSON to prevent immediate rewrite
			const mergedJson = JSON.stringify(merged, null, 2);
			if (isPersistent) {
				lastSavedJSON = mergedJson;
			} else {
				lastUserSavedJSON = mergedJson;
			}
			return merged;
		}
		// Seed the last saved JSON with defaults if file doesn't exist
		const defaultsJson = JSON.stringify(defaults, null, 2);
		if (isPersistent) {
			lastSavedJSON = defaultsJson;
		} else {
			lastUserSavedJSON = defaultsJson;
		}
		return initialData; // Return defaults if file doesn't exist
	} catch (err) {
		console.error(`Error loading ${path.basename(filePath)}:`, err);
		return initialData; // Return defaults on error
	}
}

module.exports.loadPersistentData = async () => {
	persistentData = await loadData(
		persistentPath,
		persistentDataDefaults,
		persistentData,
		true
	);
	return persistentData;
};

module.exports.loadUserData = async () => {
	userData = await loadData(userPath, userDataDefaults, userData, false);
	return userData;
};

module.exports.getPersistentData = () => persistentData;
module.exports.getUserData = () => userData;
module.exports.setPersistentData = (data) => (persistentData = data);
module.exports.setUserData = (data) => (userData = data);
