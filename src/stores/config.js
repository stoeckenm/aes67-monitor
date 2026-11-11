// stores/config.js
//
// The two config stores, as the main process defines them. persistentData is
// machine-wide, userData is per user. Mutating either one schedules a save;
// pushes coming back from main are applied with the watcher suppressed so the
// two do not bounce saves off each other.
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { bridge } from "../ipc/bridge";

const persistentDefaults = () => ({
	settings: {
		bufferSize: 16,
		bufferEnabled: true,
		hideUnsupported: true,
		sdpDeleteTimeout: 300,
		followSystemAudio: true,
		audioInterface: null,
		storedAudioInterface: null,
	},
	network: { interfaces: [], currentInterface: "" },
	devices: {},
	favorites: [],
	manualStreams: [],
	streamNames: {},
	hasPassword: false,
});

const userDefaults = () => ({
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
		// Which settings tab was last open. A local ref reset it on every
		// navigation, which made the page feel like it forgot where you were.
		settingsTab: "playback",
		// "system" | "light" | "dark"
		theme: "system",
	},
});

export const useConfigStore = defineStore("config", () => {
	const persistent = ref(persistentDefaults());
	const user = ref(userDefaults());
	const loaded = ref(false);

	let persistTimer = null;
	let userTimer = null;
	// What main last sent us, or what we last sent main. Comparing against this
	// is what stops the save ping-pong.
	//
	// A boolean "currently applying from main" flag does not work here, and the
	// previous implementation had exactly that bug: Vue flushes watchers
	// asynchronously, so the flag was already cleared again by the time the
	// callback ran and every push from main triggered a save straight back.
	let lastSyncedPersistent = "";
	let lastSyncedUser = "";

	const settings = computed(() => persistent.value.settings);
	const hasPassword = computed(() => !!persistent.value.hasPassword);

	const savePersistent = () => {
		const data = JSON.stringify(persistent.value);
		if (data === lastSyncedPersistent) return;
		lastSyncedPersistent = data;
		bridge.send({ type: "savePersistent", key: "persistentData", data });
	};

	const saveUser = () => {
		const data = JSON.stringify(user.value);
		if (data === lastSyncedUser) return;
		lastSyncedUser = data;
		bridge.send({ type: "saveUser", key: "userData", data });
	};

	const applyFromMain = (incoming) => {
		if (!incoming) return;
		persistent.value = {
			...persistentDefaults(),
			...incoming,
			settings: {
				...persistentDefaults().settings,
				...(incoming.settings || {}),
			},
			network: { ...persistentDefaults().network, ...(incoming.network || {}) },
		};
		lastSyncedPersistent = JSON.stringify(persistent.value);
	};

	const load = async () => {
		const config = await bridge.getSharedConfig();
		if (config) {
			applyFromMain(config.persistentData);
			user.value = {
				...userDefaults(),
				...config.userData,
				settings: {
					...userDefaults().settings,
					...(config.userData?.settings || {}),
				},
			};
			lastSyncedUser = JSON.stringify(user.value);
		}
		loaded.value = true;
	};

	const startWatchers = () => {
		watch(
			persistent,
			() => {
				clearTimeout(persistTimer);
				persistTimer = setTimeout(savePersistent, 300);
			},
			{ deep: true },
		);
		watch(
			user,
			() => {
				clearTimeout(userTimer);
				userTimer = setTimeout(saveUser, 300);
			},
			{ deep: true },
		);
	};

	const setSidebarCollapsed = (collapsed) => {
		user.value.settings.sidebarCollapsed = collapsed;
	};

	const setSettingsTab = (tab) => {
		user.value.settings.settingsTab = tab;
	};

	const setTheme = (theme) => {
		user.value.settings.theme = theme;
	};

	// Friendly names live in a map keyed by stream id, not on the stream
	// objects, which discovery replaces wholesale on every update.
	const nameOf = (streamId) => persistent.value.streamNames?.[streamId] || "";

	const setName = (streamId, name) => {
		if (!streamId) return;
		if (!persistent.value.streamNames) persistent.value.streamNames = {};
		const trimmed = (name || "").trim();
		if (trimmed) persistent.value.streamNames[streamId] = trimmed;
		else delete persistent.value.streamNames[streamId];
	};

	const deviceInfo = (address) => persistent.value.devices?.[address] || null;

	const setDeviceInfo = (address, info) => {
		if (!address) return;
		if (!persistent.value.devices) persistent.value.devices = {};
		persistent.value.devices[address] = info;
	};

	return {
		persistent,
		user,
		loaded,
		settings,
		hasPassword,
		load,
		startWatchers,
		applyFromMain,
		savePersistent,
		saveUser,
		setSidebarCollapsed,
		setSettingsTab,
		setTheme,
		nameOf,
		setName,
		deviceInfo,
		setDeviceInfo,
	};
});
