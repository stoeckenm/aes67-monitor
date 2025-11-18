import { ref, computed, watch } from "vue";

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

// --- Persistent (machine-wide) config ---
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
	network: {
		interfaces: [],
		currentInterface: "",
	},
	devices: [],
	favorites: [],
});

// --- User config ---
export const userData = ref({
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
});

// --- Load both configs ---
async function loadSharedConfig() {
	if (!window.electronAPI) {
		console.warn("Electron API not available — running in browser?");
		return;
	}

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
		devices: {
			...persistentData.value.devices,
			...config.persistentData.devices,
		},
	};

	// Merge user config
	userData.value = {
		...userData.value,
		settings: { ...userData.value.settings, ...config.userData.settings },
		favorites: config.persistentData.favorites || [],
	};
}

// --- Save only persistent config ---
export function savePersistentConfig() {
	if (!window.electronAPI) return;

	console.log(persistentData.value);
	window.electronAPI.sendMessage({
		type: "savePersistent",
		key: "persistentData",
		data: JSON.stringify(persistentData.value),
	});
}

// --- Save only user config ---
export function saveUserConfig() {
	if (!window.electronAPI) return;
	window.electronAPI.sendMessage({
		type: "saveUser",
		key: "userData",
		data: JSON.stringify(userData.value),
	});
}

// Auto-load on startup
loadSharedConfig();

// --- Watchers ---
let persistTimer;
watch(
	() => persistentData.value,
	() => {
		clearTimeout(persistTimer);
		persistTimer = setTimeout(() => savePersistentConfig(), 300);
	},
	{ deep: true }
);

let userTimer;
watch(
	() => userData.value,
	() => {
		clearTimeout(userTimer);
		userTimer = setTimeout(() => saveUserConfig(), 300);
	},
	{ deep: true }
);

// --- Raw SDP ---
export const rawSDP = ref({
	sdp: "",
	announce: false,
});

// --- UI Helpers ---
export const isBackBtnActive = () => ["stream", "sdp"].includes(page.value);

export const goBack = () => {
	if (["stream", "sdp"].includes(page.value)) page.value = "streams";
};

export const getTitle = () => {
	switch (page.value) {
		case "stream":
			return selectedStream.value?.name || "";
		case "sdp":
			return "Add Stream";
		case "interfaces":
			return "Audio Interfaces";
		default:
			return page.value.charAt(0).toUpperCase() + page.value.slice(1);
	}
};

export const isPageSearchable = () =>
	["streams", "devices"].includes(page.value);

export const viewPage = (newPage) => {
	page.value = newPage;
};

export const getPageTitle = () => {
	switch (page.value) {
		case "stream":
		case "sdp":
			return "Streams";
	}
};

// --- Sidebar ---
export const setSidebarStatus = (status) => {
	userData.value.settings.sidebarCollapsed = status;
	saveUserConfig();
};

// --- Search / Filters ---
export const searchStreams = () => {
	const filteredStream = streams.value.filter((stream) => {
		return (
			(stream.name.toLowerCase().includes(search.value.streams.toLowerCase()) ||
				stream.origin.address
					.toLowerCase()
					.includes(search.value.streams.toLowerCase()) ||
				stream.id.includes(search.value.streams)) &&
			(stream.isSupported || !persistentData.value.settings.hideUnsupported)
		);
	});
	visibleStreams.value = filteredStream.length;
	return filteredStream;
};

export const searchDevices = computed(() => {
	// List of all device IPs
	const deviceIPs = [...new Set(streams.value.map((s) => s.origin.address))];

	// Build a derived list of devices with metadata (NON-PERSISTED)
	const derivedDeviceList = deviceIPs.map((ip) => {
		const relatedStreams = streams.value.filter((s) => s.origin.address === ip);

		return {
			ip,
			name: ip, // (or a friendly default)
			description: "-", // (or derive something)
			count: relatedStreams.length,
		};
	});

	// Filter by search term
	return derivedDeviceList.filter((device) => {
		const term = search.value.devices.toLowerCase();

		return (
			device.ip.toLowerCase().includes(term) ||
			device.name.toLowerCase().includes(term) ||
			device.description.toLowerCase().includes(term)
		);
	});
});

// --- Time Helper ---
export const getDate = (timestamp) => new Date(timestamp).toLocaleString();

// --- Device / Stream Views ---
export const viewDevice = (device) => {
	search.value.streams = device;
	page.value = "streams";
	document.getElementById("search-input")?.focus();
};

export const getTextareaRowNumber = () => {
	return selectedStream.value?.raw
		.split("\n")
		.filter((line) => line.trim() !== "").length;
};

export const viewStream = (stream) => {
	page.value = "stream";
	selectedStream.value = stream;
};

// --- Dev Mode ---
export const isDevMode = () => process.env.NODE_ENV === "development";

// --- Audio Devices ---
export const getAudioOutputDevices = () =>
	audioInterfaces.value.filter((d) => d.outputChannels > 0);

export const getDefaultAudioOutputDevice = () =>
	audioInterfaces.value.find((d) => d.isDefaultOutput);

export const getCurrentAudioOutput = () =>
	audioInterfaces.value.filter((d) => d.outputChannels > 0 && d.isCurrent);

export const getCurrentSupportedSampleRates = () => {
	const currentDevice = getCurrentAudioOutput();
	return currentDevice.length > 0 ? currentDevice[0].sampleRates : [];
};

export const getAudioInputDevices = () =>
	audioInterfaces.value.filter((d) => d.inputChannels > 0);

// --- Play Streams ---
export const saveSDP = () => {
	sendMessage({
		type: "addStream",
		data: { sdp: rawSDP.value.sdp, announce: rawSDP.value.announce },
	});
	rawSDP.value.sdp = "";
	page.value = "streams";
};

export const getChannelSelectValues = (stream) => {
	let mono = [];
	let stereo = [];
	for (let i = 0; i < stream.channels; i++) {
		mono.push({ value: i + "," + i, string: i + 1 + " Mono" });
		if (i % 2 === 0 && stream.channels > 1) {
			stereo.push({
				value: i + "," + (i + 1),
				string: i + 1 + " + " + (i + 2) + " Stereo",
			});
		}
	}

	const values = stereo.concat(mono);
	if (!selectedChannel.value[stream.id]) {
		selectedChannel.value[stream.id] = values[0].value;
		streamIndex.value[stream.id] = 0;
	}

	return values;
};

export const stopStream = () => {
	playing.value = "";
	currentStream.value = null;
	sendMessage({ type: "stop" });
	return;
};

export const playStream = (stream) => {
	currentStream.value = stream;
	getChannelSelectValues(stream);

	if (playing.value === stream.id) {
		playing.value = "";
		currentStream.value = null;
		sendMessage({ type: "stop" });
		return;
	}

	playing.value = stream.id;

	const channelMapping = selectedChannel.value[stream.id].split(",");
	const streamMapping = streamIndex.value[stream.id];
	const channel0 = parseInt(channelMapping[0]);
	const channel1 = parseInt(channelMapping[1]);

	if (stream.media[streamMapping]?.rtp?.[0]) {
		const rtp = stream.media[streamMapping].rtp[0];
		const data = {
			id: stream.id,
			mcast:
				streamMapping > 0
					? stream.media[streamMapping].connection.ip.split("/")[0]
					: stream.mcast,
			port: stream.media[streamMapping].port,
			codec: rtp.codec,
			ptime: stream.media[streamMapping].ptime,
			samplerate: rtp.rate,
			channels: rtp.encoding,
			ch1Map: channel0,
			ch2Map: channel1,
			jitterBufferEnabled: persistentData.value.settings.bufferEnabled,
			jitterBufferSize: persistentData.value.settings.bufferSize,
			filter: !!stream.media[streamMapping].sourceFilter,
			filterAddr: stream.media[streamMapping].sourceFilter?.srcList || "",
		};
		sendMessage({ type: "play", data });
	} else {
		console.error("Error playing stream: missing RTP data");
	}
};

// --- Audio Interface ---
export const setCurrentAudioInterface = (device) => {
	let data = null;
	if (device) {
		data = {
			name: device.name,
			inputChannels: device.inputChannels,
			outputChannels: device.outputChannels,
		};
	}

	sendMessage({
		type: "setAudioInterface",
		data,
	});

	if (device) persistentData.value.settings.audioInterface = { ...device };

	if (playing.value) sendMessage({ type: "restart" });
};

export const updateAudioInterface = () => {
	playing.value = "";
	sendMessage({ type: "stop" });
	setCurrentAudioInterface(persistentData.value.settings.audioInterface);
	if (currentStream.value) playStream(currentStream.value);
};

// --- IPC Helpers ---
export const sendMessage = (message) => {
	if (window?.electronAPI?.sendMessage) {
		const safeMessage = JSON.parse(JSON.stringify(message));
		window.electronAPI.sendMessage(safeMessage);
	} else {
		console.error("Cannot send message to Electron backend!");
	}
};

// --- Electron Message Receiver ---
if (window.electronAPI) {
	window.electronAPI.recvMessage((message) => {
		switch (message.type) {
			case "favorites":
				favorites.value = message.data;
				favoriteCount.value = message.data.length;
				break;
			case "streams":
				streams.value = message.data;
				streamCount.value = message.data.length;
				break;
			case "devices":
				devices.value = message.data;
				break;
			case "interfaces":
				networkInterfaces.value = message.data;
				break;
			case "audioDevices":
				audioInterfaces.value = message.data;
				interfaceCount.value = message.data.length;
				break;
			case "updatePersistentData":
				persistentData.value = message.data;
				break;
			case "refreshAfterDeviceChange":
				console.log("refresh after device change");
				playing.value = "";
				if (currentStream.value) playStream(currentStream.value);
				break;
			default:
				console.log(message.type, message.data);
		}
	});

	sendMessage({ type: "update" });
} else {
	console.log("Running outside Electron");
}
