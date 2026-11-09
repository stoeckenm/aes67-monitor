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

// Favorites used to be stored as whole stream objects, raw SDP and media list
// included. That bloated the config and meant a favorite was replayed from a
// snapshot taken when it was starred, with stale multicast and media details.
// A favorite is a reference now; live data is resolved against discovery.
function migrateFavorites(favorites, streamNames) {
	if (!Array.isArray(favorites)) {
		return { value: [], names: streamNames, changed: true };
	}

	const names = { ...streamNames };
	let changed = false;
	const value = [];

	favorites.forEach((entry, index) => {
		if (!entry || typeof entry !== "object" || !entry.id) {
			changed = true;
			return;
		}
		// A friendly name stored on the favorite moves to the shared name map
		if (entry.friendlyName && !names[entry.id]) {
			names[entry.id] = entry.friendlyName;
			changed = true;
		}
		const order = Number.isInteger(entry.order) ? entry.order : index;
		if (Object.keys(entry).length > 2 || !Number.isInteger(entry.order)) {
			changed = true;
		}
		value.push({ id: entry.id, order });
	});

	value.sort((a, b) => a.order - b.order);
	value.forEach((entry, index) => {
		if (entry.order !== index) {
			entry.order = index;
			changed = true;
		}
	});

	return { value, names, changed };
}

function mergePersistent(stored) {
	const defaults = persistentDataDefaults;
	const devices = migrateDevices(stored.devices);
	const storedNames =
		stored.streamNames && typeof stored.streamNames === "object"
			? stored.streamNames
			: {};
	const favorites = migrateFavorites(stored.favorites, storedNames);

	const merged = {
		settings: { ...defaults.settings, ...(stored.settings || {}) },
		network: { ...defaults.network, ...(stored.network || {}) },
		devices: devices.value,
		favorites: favorites.value,
		streamNames: favorites.names,
		// Streams added by hand are replayed into the discovery worker on
		// startup; without this they were lost on every restart.
		manualStreams: Array.isArray(stored.manualStreams)
			? stored.manualStreams.filter((s) => s && typeof s.sdp === "string")
			: [],
		passwordHash:
			typeof stored.passwordHash === "string" ? stored.passwordHash : null,
	};

	// adminMode used to be persisted here, which left kiosk machines unlocked
	// after a restart. It is session state now and must not come back.
	const changed = devices.changed || favorites.changed || "adminMode" in stored;
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

module.exports = {
	migrateDevices,
	migrateFavorites,
	mergePersistent,
	mergeUser,
	forRenderer,
};
