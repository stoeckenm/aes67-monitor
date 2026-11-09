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
	},
});

export const useConfigStore = defineStore("config", () => {
	const persistent = ref(persistentDefaults());
	const user = ref(userDefaults());
	const loaded = ref(false);

	let applyingFromMain = false;
	let persistTimer = null;
	let userTimer = null;

	const settings = computed(() => persistent.value.settings);
	const hasPassword = computed(() => !!persistent.value.hasPassword);

	const savePersistent = () => {
		bridge.send({
			type: "savePersistent",
			key: "persistentData",
			data: JSON.stringify(persistent.value),
		});
	};

	const saveUser = () => {
		bridge.send({
			type: "saveUser",
			key: "userData",
			data: JSON.stringify(user.value),
		});
	};

	// Applied from main: replace without triggering a save back
	const applyFromMain = (incoming) => {
		if (!incoming) return;
		applyingFromMain = true;
		persistent.value = {
			...persistentDefaults(),
			...incoming,
			settings: {
				...persistentDefaults().settings,
				...(incoming.settings || {}),
			},
			network: { ...persistentDefaults().network, ...(incoming.network || {}) },
		};
		applyingFromMain = false;
	};

	const load = async () => {
		const config = await bridge.getSharedConfig();
		if (config) {
			applyFromMain(config.persistentData);
			applyingFromMain = true;
			user.value = {
				...userDefaults(),
				...config.userData,
				settings: {
					...userDefaults().settings,
					...(config.userData?.settings || {}),
				},
			};
			applyingFromMain = false;
		}
		loaded.value = true;
	};

	const startWatchers = () => {
		watch(
			persistent,
			() => {
				if (applyingFromMain) return;
				clearTimeout(persistTimer);
				persistTimer = setTimeout(savePersistent, 300);
			},
			{ deep: true },
		);
		watch(
			user,
			() => {
				if (applyingFromMain) return;
				clearTimeout(userTimer);
				userTimer = setTimeout(saveUser, 300);
			},
			{ deep: true },
		);
	};

	const setSidebarCollapsed = (collapsed) => {
		user.value.settings.sidebarCollapsed = collapsed;
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
		nameOf,
		setName,
		deviceInfo,
		setDeviceInfo,
	};
});
