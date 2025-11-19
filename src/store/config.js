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

		// Merge machine-wide persistent config
		persistentData.value = {
			...persistentData.value,
			settings: {
				...persistentData.value.settings,
				...config.persistentData.settings,
			},
			network: {
				...persistentData.value.network,
				...config.persistentData.network,
			},
			devices: Array.isArray(config.persistentData.devices)
				? config.persistentData.devices
				: persistentData.value.devices,
			favorites: Array.isArray(config.persistentData.favorites)
				? config.persistentData.favorites
				: persistentData.value.favorites,
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
		{ deep: true }
	);

	let userTimer;
	watch(
		() => userData.value,
		() => {
			if (isApplyingFromMain()) return;
			clearTimeout(userTimer);
			userTimer = setTimeout(() => saveUserConfig(), 300);
		},
		{ deep: true }
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
		}
	);
}
