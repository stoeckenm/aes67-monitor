// renderer/store/actions.js
import { computed, watch } from "vue";
import {
	page,
	search,
	streams,
	persistentData,
	userData,
	selectedStream,
	audioInterfaces,
	playing,
	currentStream,
	selectedChannel,
	streamIndex,
	rawSDP,
} from "./state";
import { sendMessage } from "./ipc";
import { saveUserConfig, savePersistentConfig } from "./config";

// --- Friendly names ---
// Kept in a map keyed by stream id rather than on the stream objects, which
// are replaced wholesale on every discovery update.
export const getStreamName = (stream) => {
	if (!stream) return "";
	return persistentData.value.streamNames?.[stream.id] || "";
};
export const getDisplayName = (stream) =>
	getStreamName(stream) || stream?.name || "-";
export const setStreamName = (streamId, name) => {
	if (!streamId) return;
	if (!persistentData.value.streamNames) persistentData.value.streamNames = {};
	const trimmed = (name || "").trim();
	if (trimmed) persistentData.value.streamNames[streamId] = trimmed;
	else delete persistentData.value.streamNames[streamId];
	savePersistentConfig();
};

// --- Network ---
// The selection has to be announced explicitly; persisting it alone leaves the
// discovery worker on the old interface until the app restarts.
export const setNetworkInterface = (address) => {
	if (!address) return;
	persistentData.value.network.currentInterface = address;
	sendMessage({ type: "setNetwork", data: address });
};

// --- UI Helpers ---
export const isBackBtnActive = () => ["stream", "sdp"].includes(page.value);
export const goBack = () => {
	if (["stream", "sdp"].includes(page.value)) page.value = "streams";
};
export const getTitle = () => {
	switch (page.value) {
		case "stream":
			return getDisplayName(selectedStream.value);
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
// --- Dev Mode ---
export const isDevMode = () => import.meta.env.DEV;

// --- Sidebar ---
export const setSidebarStatus = (status) => {
	userData.value.settings.sidebarCollapsed = status;
	saveUserConfig();
};

// --- Search / Filters ---
// A computed, not a function with a side effect: the previous version wrote
// visibleStreams while a computed was evaluating it, i.e. a reactive write
// during render.
export const filteredStreams = computed(() => {
	const term = search.value.streams.toLowerCase();
	return streams.value.filter((stream) => {
		return (
			((stream.name || "").toLowerCase().includes(term) ||
				getStreamName(stream).toLowerCase().includes(term) ||
				(stream.origin?.address || "").toLowerCase().includes(term) ||
				stream.id.includes(search.value.streams)) &&
			(stream.isSupported || !persistentData.value.settings.hideUnsupported)
		);
	});
});

export const visibleStreams = computed(() => filteredStreams.value.length);

export const searchDevices = computed(() => {
	// One entry per announcing device address
	const counts = new Map();
	for (const stream of streams.value) {
		const ip = stream.origin?.address;
		if (!ip) continue;
		counts.set(ip, (counts.get(ip) || 0) + 1);
	}
	const derivedDeviceList = [...counts.entries()].map(([ip, count]) => ({
		ip,
		name: ip,
		description: "-",
		count,
	}));
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

// --- Device / Stream Views ---
export const viewDevice = (device) => {
	search.value.streams = device;
	page.value = "streams";
	document.getElementById("search-input")?.focus();
};

export const getTextareaRowNumber = () => {
	// The optional chain stopped at .raw, so a stream without raw SDP still
	// threw on .split
	const raw = selectedStream.value?.raw;
	if (!raw) return 1;
	return raw.split("\n").filter((line) => line.trim() !== "").length;
};

export const viewStream = (stream) => {
	page.value = "stream";
	selectedStream.value = stream;
};

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

// Pure: this is called straight from a template, where it used to also write
// selectedChannel and streamIndex, i.e. mutate the store during render.
export const getChannelSelectValues = (stream) => {
	const mono = [];
	const stereo = [];
	const channels = Number(stream?.channels) || 0;
	for (let i = 0; i < channels; i++) {
		mono.push({ value: i + "," + i, string: i + 1 + " Mono" });
		if (i % 2 === 0 && channels > 1) {
			stereo.push({
				value: i + "," + (i + 1),
				string: i + 1 + " + " + (i + 2) + " Stereo",
			});
		}
	}
	return stereo.concat(mono);
};

// Called when a stream first shows up, and before playback, rather than from
// the render pass.
export const ensureChannelDefault = (stream) => {
	if (!stream?.id) return;
	if (selectedChannel.value[stream.id]) return;
	const values = getChannelSelectValues(stream);
	if (values.length === 0) return;
	selectedChannel.value[stream.id] = values[0].value;
	streamIndex.value[stream.id] = 0;
};

// Keep the defaults in step with discovery without touching them mid-render.
watch(
	streams,
	(list) => {
		for (const stream of list) {
			if (stream.isSupported) ensureChannelDefault(stream);
		}
	},
	{ immediate: true },
);

export const stopStream = () => {
	playing.value = "";
	currentStream.value = null;
	sendMessage({ type: "stop" });
};

export const playStream = (stream) => {
	currentStream.value = stream;
	ensureChannelDefault(stream);
	if (playing.value === stream.id) {
		stopStream(); // Original logic handles stop if already playing
		return;
	}
	// An unsupported stream has no channel mapping, so bail out rather than
	// splitting undefined
	const mapping = selectedChannel.value[stream.id];
	if (!mapping) {
		console.error("Cannot play stream without a channel mapping:", stream.id);
		return;
	}
	playing.value = stream.id;
	const channelMapping = mapping.split(",");
	const streamMapping = streamIndex.value[stream.id] || 0;
	const channel0 = parseInt(channelMapping[0]);
	const channel1 = parseInt(channelMapping[1]);

	if (stream.media[streamMapping]?.rtp?.[0]) {
		const rtp = stream.media[streamMapping].rtp[0];
		const data = {
			id: stream.id,
			mcast:
				streamMapping > 0
					? stream.media[streamMapping].connection?.ip?.split("/")[0] ||
						stream.mcast
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
