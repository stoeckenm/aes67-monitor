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

	const filtered = computed(() => {
		const term = session.search.trim().toLowerCase();
		return streams.value.filter((stream) => {
			const matches =
				!term ||
				(stream.name || "").toLowerCase().includes(term) ||
				config.nameOf(stream.id).toLowerCase().includes(term) ||
				(stream.origin?.address || "").toLowerCase().includes(term) ||
				stream.id.includes(session.search.trim());
			const visible = stream.isSupported || !config.settings.hideUnsupported;
			return matches && visible;
		});
	});

	const visibleCount = computed(() => filtered.value.length);

	// One row per announcing device, counted in a single pass
	const devices = computed(() => {
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
				(device) =>
					!term ||
					device.address.toLowerCase().includes(term) ||
					device.name.toLowerCase().includes(term) ||
					device.description.toLowerCase().includes(term),
			);
	});

	return {
		streams,
		networkInterfaces,
		audioDevices,
		applyStreams,
		streamById,
		displayName,
		outputDevices,
		currentOutput,
		supportedSampleRates,
		canPlay,
		filtered,
		visibleCount,
		devices,
	};
});
