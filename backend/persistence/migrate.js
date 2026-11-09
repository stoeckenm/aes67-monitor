// persistence/migrate.js
//
// Pure merge and migration helpers for the two config stores. Kept free of
// electron imports so they can be tested directly.
const {
	persistentDataDefaults,
	userDataDefaults,
} = require("../config/defaults");

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

// Only ever the user's own UI state: the previous shared merge also injected
// network, devices and favorites into user.json.
function mergeUser(stored) {
	return {
		merged: {
			settings: { ...userDataDefaults.settings, ...(stored.settings || {}) },
		},
		changed: false,
	};
}

// The renderer never needs the password hash, only whether one is set.
function forRenderer(persistentData) {
	const { passwordHash, ...rest } = persistentData;
	return { ...rest, hasPassword: typeof passwordHash === "string" };
}

module.exports = { migrateDevices, mergePersistent, mergeUser, forRenderer };
