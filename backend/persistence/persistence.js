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
				2
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

// Earlier versions declared devices as an array in the defaults while the UI
// addressed it as a map keyed by IP, so stored names were discarded on every
// load and save. Normalize to a map once.
function migrateDevices(devices) {
	if (Array.isArray(devices)) {
		const migrated = {};
		for (const entry of devices) {
			if (entry && typeof entry === "object" && entry.address) {
				migrated[entry.address] = {
					name: entry.name || entry.address,
					description: entry.description || "-",
				};
			}
		}
		return { value: migrated, changed: true };
	}
	if (devices && typeof devices === "object") {
		return { value: devices, changed: false };
	}
	return { value: {}, changed: true };
}

function mergePersistent(stored) {
	const defaults = persistentDataDefaults;
	const devices = migrateDevices(stored.devices);

	const merged = {
		settings: { ...defaults.settings, ...(stored.settings || {}) },
		network: { ...defaults.network, ...(stored.network || {}) },
		devices: devices.value,
		favorites: Array.isArray(stored.favorites)
			? stored.favorites
			: structuredClone(defaults.favorites),
		streamNames:
			stored.streamNames && typeof stored.streamNames === "object"
				? stored.streamNames
				: {},
		passwordHash:
			typeof stored.passwordHash === "string" ? stored.passwordHash : null,
	};

	// adminMode used to be persisted here, which left kiosk machines unlocked
	// after a restart. It is session state now and must not come back.
	const changed = devices.changed || "adminMode" in stored;
	return { merged, changed };
}

function mergeUser(stored) {
	const defaults = userDataDefaults;
	return {
		settings: { ...defaults.settings, ...(stored.settings || {}) },
	};
}

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
		const result = merge(stored);
		const data = result.merged || result;

		if (result.changed) {
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
			json: result.changed ? "" : JSON.stringify(data, null, 2),
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
		structuredClone(persistentDataDefaults)
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
		structuredClone(userDataDefaults)
	);
	userData = data;
	lastUserSavedJSON = json;
	return userData;
};

module.exports.getPersistentData = () => persistentData;
module.exports.getUserData = () => userData;
module.exports.setPersistentData = (data) => (persistentData = data);
module.exports.setUserData = (data) => (userData = data);

// The renderer never needs the password hash, only whether one is set.
module.exports.getPersistentDataForRenderer = () => {
	const { passwordHash, ...rest } = persistentData;
	return { ...rest, hasPassword: typeof passwordHash === "string" };
};
