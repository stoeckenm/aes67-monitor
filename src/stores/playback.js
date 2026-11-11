// stores/playback.js
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { bridge } from "../ipc/bridge";
import { useConfigStore } from "./config";
import { useDiscoveryStore } from "./discovery";

export const usePlaybackStore = defineStore("playback", () => {
	const config = useConfigStore();
	const discovery = useDiscoveryStore();

	const playingId = ref("");
	const currentStream = ref(null);
	// Keyed by stream id: "ch1,ch2" and the index into stream.media
	const channelByStream = ref({});
	const mediaByStream = ref({});

	const isPlaying = (id) => playingId.value === id;
	const anyPlaying = computed(() => !!playingId.value);

	// Pure: used from templates, so it must not write to the store
	const channelOptions = (stream) => {
		const mono = [];
		const stereo = [];
		const channels = Number(stream?.channels) || 0;
		for (let i = 0; i < channels; i++) {
			mono.push({ value: `${i},${i}`, kind: "mono", channel: i + 1 });
			if (i % 2 === 0 && channels > 1) {
				stereo.push({
					value: `${i},${i + 1}`,
					kind: "stereo",
					first: i + 1,
					second: i + 2,
				});
			}
		}
		return stereo.concat(mono);
	};

	const ensureDefaults = (stream) => {
		if (!stream?.id || channelByStream.value[stream.id]) return;
		const options = channelOptions(stream);
		if (options.length === 0) return;
		channelByStream.value[stream.id] = options[0].value;
		mediaByStream.value[stream.id] = 0;
	};

	const stop = () => {
		playingId.value = "";
		currentStream.value = null;
		bridge.send({ type: "stop" });
	};

	const play = (stream) => {
		if (!stream) return;
		if (isPlaying(stream.id)) {
			stop();
			return;
		}
		ensureDefaults(stream);

		const mapping = channelByStream.value[stream.id];
		if (!mapping) {
			console.error("No channel mapping for stream", stream.id);
			return;
		}
		const mediaIndex = mediaByStream.value[stream.id] || 0;
		const media = stream.media?.[mediaIndex];
		if (!media?.rtp?.[0]) {
			console.error("Stream has no usable media entry", stream.id);
			return;
		}

		const [ch1, ch2] = mapping.split(",").map((value) => parseInt(value, 10));
		currentStream.value = stream;
		playingId.value = stream.id;

		bridge.send({
			type: "play",
			data: {
				id: stream.id,
				mcast:
					mediaIndex > 0
						? media.connection?.ip?.split("/")[0] || stream.mcast
						: stream.mcast,
				port: media.port,
				codec: media.rtp[0].codec,
				ptime: media.ptime,
				samplerate: media.rtp[0].rate,
				channels: media.rtp[0].encoding,
				ch1Map: ch1,
				ch2Map: ch2,
				jitterBufferEnabled: config.settings.bufferEnabled,
				jitterBufferSize: config.settings.bufferSize,
				filter: !!media.sourceFilter,
				filterAddr: media.sourceFilter?.srcList || "",
			},
		});
	};

	// Playback was interrupted by main (device change or a worker restart)
	const resume = () => {
		playingId.value = "";
		const stream = currentStream.value;
		if (stream) play(stream);
	};

	// The preference is main-owned, so it is asked for rather than written
	// into the config here: a settings save would race main's own decision.
	const setPreferredOutputDevice = (device) => {
		bridge.send({
			type: "setPreferredAudioInterface",
			data: device
				? {
						name: device.name,
						inputChannels: device.inputChannels,
						outputChannels: device.outputChannels,
					}
				: null,
		});
		if (playingId.value) bridge.send({ type: "restart" });
	};

	const selectOutputDevice = (device) => {
		bridge.send({
			type: "setAudioInterface",
			data: device
				? {
						name: device.name,
						inputChannels: device.inputChannels,
						outputChannels: device.outputChannels,
					}
				: null,
		});
		if (playingId.value) bridge.send({ type: "restart" });
	};

	// Keep the channel defaults in step with discovery, outside the render pass
	const watchDiscovery = () => {
		watch(
			() => discovery.streams,
			(list) => {
				for (const stream of list) {
					if (stream.isSupported) ensureDefaults(stream);
				}
			},
			{ immediate: true, deep: false },
		);

		// Main needs to know whether anything is playing so it can skip the
		// stop message when nothing is
		watch(playingId, (value) => {
			bridge.send({
				type: "playingStatus",
				data: { isPlaying: !!value, streamId: value || null },
			});
		});
	};

	return {
		playingId,
		currentStream,
		channelByStream,
		mediaByStream,
		isPlaying,
		anyPlaying,
		channelOptions,
		ensureDefaults,
		play,
		stop,
		resume,
		selectOutputDevice,
		setPreferredOutputDevice,
		watchDiscovery,
	};
});
