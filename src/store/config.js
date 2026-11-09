// renderer/store/config.js
import { watch } from "vue";
import { persistentData, userData, playing } from "./state";
import { isApplyingFromMain, setApplyingFromMain, sendMessage } from "./ipc";

// --- Load both configs ---
export async function loadSharedConfig() {
	if (!window.electronAPI) {
		console.warn("Electron API not available — running in browser?");
		return;
	}
	setApplyingFromMain(true);
	try {
		const config = await window.electronAPI.getSharedConfig();
		if (!config) return;

		// The main process already merged this against the defaults, so the
		// incoming object is authoritative and only needs the local defaults as
		// a floor for keys an older build might not send. Rebuilding it key by
		// key here is what dropped the device map and the stream names: devices
		// became an object, and the old merge tested it with Array.isArray.
		const incoming = config.persistentData || {};
		persistentData.value = {
			...persistentData.value,
			...incoming,
			settings: {
				...persistentData.value.settings,
				...(incoming.settings || {}),
			},
			network: {
				...persistentData.value.network,
				...(incoming.network || {}),
			},
		};

		// Merge user config
		userData.value = {
			...userData.value,
			settings: { ...userData.value.settings, ...config.userData.settings },
		};
	} finally {
		setApplyingFromMain(false);
	}
}

// --- Save only persistent config ---
export function savePersistentConfig() {
	if (!window.electronAPI) return;
	sendMessage({
		type: "savePersistent",
		key: "persistentData",
		data: JSON.stringify(persistentData.value),
	});
}

// --- Save only user config ---
export function saveUserConfig() {
	if (!window.electronAPI) return;
	sendMessage({
		type: "saveUser",
		key: "userData",
		data: JSON.stringify(userData.value),
	});
}

// --- Watchers ---
export function setupConfigWatchers() {
	let persistTimer;
	watch(
		() => persistentData.value,
		() => {
			if (isApplyingFromMain()) return;
			clearTimeout(persistTimer);
			persistTimer = setTimeout(() => savePersistentConfig(), 300);
		},
		{ deep: true },
	);

	let userTimer;
	watch(
		() => userData.value,
		() => {
			if (isApplyingFromMain()) return;
			clearTimeout(userTimer);
			userTimer = setTimeout(() => saveUserConfig(), 300);
		},
		{ deep: true },
	);

	watch(
		() => playing.value,
		(newVal) => {
			if (window.electronAPI) {
				sendMessage({
					type: "playingStatus",
					data: { isPlaying: !!newVal, streamId: newVal || null },
				});
			}
		},
	);
}
