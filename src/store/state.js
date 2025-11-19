// renderer/store/state.js
import { ref } from "vue";

// --- State ---
export const page = ref("favorites");
export const search = ref({ streams: "", interfaces: "", devices: "" });
export const streams = ref([]);
export const favorites = ref([]);
export const devices = ref([]);
export const favoriteCount = ref(0);
export const streamCount = ref(0);
export const networkInterfaces = ref([]);
export const audioInterfaces = ref([]);
export const interfaceCount = ref(0);
export const selectedStream = ref(null);
export const selectedChannel = ref([]);
export const streamIndex = ref([]);
export const visibleStreams = ref(0);
export const playing = ref("");
export const currentStream = ref("");
export const rawSDP = ref({ sdp: "", announce: false });

// --- Persistent (machine-wide) config defaults ---
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
	devices: [],
	favorites: [],
});

// --- User config defaults ---
export const userData = ref({
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
});
