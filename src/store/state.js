// renderer/store/state.js
import { ref } from "vue";

// --- State ---
export const page = ref("favorites");
export const search = ref({ streams: "", interfaces: "", devices: "" });
export const streams = ref([]);
export const streamCount = ref(0);
export const networkInterfaces = ref([]);
export const audioInterfaces = ref([]);
export const selectedStream = ref(null);
export const selectedChannel = ref({});
export const streamIndex = ref({});
export const playing = ref("");
export const currentStream = ref("");
export const rawSDP = ref({ sdp: "", announce: false });

// Session state, deliberately not persisted: a kiosk machine has to come back
// up locked after a restart.
export const adminMode = ref(false);

// Last error reported by the main process or one of its workers
export const lastError = ref(null);

// --- Persistent (machine-wide) config defaults ---
// Mirrors backend/config/defaults.js. The password hash is never sent here,
// only the hasPassword flag.
export const persistentData = ref({
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

// --- User config defaults ---
export const userData = ref({
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
});
