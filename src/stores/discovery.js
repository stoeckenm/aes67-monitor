// stores/discovery.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useConfigStore } from "./config";
import { useSessionStore } from "./session";

export const useDiscoveryStore = defineStore("discovery", () => {
	const config = useConfigStore();
	const session = useSessionStore();

	const streams = ref([]);
	const networkInterfaces = ref([]);
	const audioDevices = ref([]);
	// When the last announcement batch arrived. The overview needs an answer to
	// "is discovery hearing anything at all", which a stream count alone does
	// not give: a stale list and a live one look identical.
	const lastUpdate = ref(0);

	// Discovery sends the full session list. Merging by id keeps object
	// identities alive, so a reference held elsewhere (the open detail page)
	// does not go stale.
	const known = new Map();

	const applyStreams = (incoming) => {
		if (!Array.isArray(incoming)) return;
		const merged = [];
		const seen = new Set();
		for (const stream of incoming) {
			seen.add(stream.id);
			const existing = known.get(stream.id);
			if (existing) {
				Object.assign(existing, stream);
				merged.push(existing);
			} else {
				known.set(stream.id, stream);
				merged.push(stream);
			}
		}
		for (const id of [...known.keys()]) {
			if (!seen.has(id)) known.delete(id);
		}
		streams.value = merged;
		lastUpdate.value = Date.now();
	};

	const streamById = (id) => known.get(id) || null;

	const displayName = (stream) => {
		if (!stream) return "";
		return config.nameOf(stream.id) || stream.name || "-";
	};

	const outputDevices = computed(() =>
		audioDevices.value.filter((d) => d.outputChannels > 0),
	);

	const currentOutput = computed(
		() => outputDevices.value.find((d) => d.isCurrent) || null,
	);

	const supportedSampleRates = computed(
		() => currentOutput.value?.sampleRates || [],
	);

	// A stream the current output device cannot clock is not playable
	const canPlay = (stream) =>
		!!stream?.isSupported &&
		supportedSampleRates.value.includes(stream.samplerate);

	const matchesTerm = (stream, term) =>
		!term ||
		(stream.name || "").toLowerCase().includes(term) ||
		config.nameOf(stream.id).toLowerCase().includes(term) ||
		(stream.origin?.address || "").toLowerCase().includes(term) ||
		stream.id.includes(term);

	const filtered = computed(() => {
		const term = session.search.trim().toLowerCase();
		const sender = session.senderFilter;
		return streams.value.filter((stream) => {
			if (sender && stream.origin?.address !== sender) return false;
			const visible = stream.isSupported || !config.settings.hideUnsupported;
			return matchesTerm(stream, term) && visible;
		});
	});

	const visibleCount = computed(() => filtered.value.length);

	// Unfiltered tallies for the overview, which has to describe the whole
	// network rather than whatever the Streams page is currently showing.
	const playableCount = computed(
		() => streams.value.filter((stream) => canPlay(stream)).length,
	);
	const unsupportedCount = computed(
		() => streams.value.filter((stream) => !stream.isSupported).length,
	);
	const manualCount = computed(
		() => streams.value.filter((stream) => stream.manual).length,
	);

	// One row per announcing sender, counted in a single pass
	const senders = computed(() => {
		const counts = new Map();
		for (const stream of streams.value) {
			const ip = stream.origin?.address;
			if (!ip) continue;
			counts.set(ip, (counts.get(ip) || 0) + 1);
		}
		const term = session.search.trim().toLowerCase();
		return [...counts.entries()]
			.map(([address, count]) => {
				const stored = config.deviceInfo(address);
				return {
					address,
					count,
					name: stored?.name || address,
					description: stored?.description || "-",
				};
			})
			.filter(
				(sender) =>
					!term ||
					sender.address.toLowerCase().includes(term) ||
					sender.name.toLowerCase().includes(term) ||
					sender.description.toLowerCase().includes(term),
			);
	});

	const senderCount = computed(() => {
		const addresses = new Set();
		for (const stream of streams.value) {
			if (stream.origin?.address) addresses.add(stream.origin.address);
		}
		return addresses.size;
	});

	const activeInterface = computed(() => {
		const address = config.persistent.network?.currentInterface || "";
		if (!address) return null;
		return (
			networkInterfaces.value.find((item) => item.address === address) || {
				name: "",
				address,
			}
		);
	});

	return {
		streams,
		networkInterfaces,
		audioDevices,
		lastUpdate,
		applyStreams,
		streamById,
		displayName,
		outputDevices,
		currentOutput,
		supportedSampleRates,
		canPlay,
		filtered,
		visibleCount,
		playableCount,
		unsupportedCount,
		manualCount,
		senders,
		senderCount,
		activeInterface,
	};
});
