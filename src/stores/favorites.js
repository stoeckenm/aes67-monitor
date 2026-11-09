// stores/favorites.js
//
// A favorite is a reference, { id, order }. Live data is resolved against
// discovery, so a favorite is never played from a snapshot taken when it was
// starred.
import { defineStore } from "pinia";
import { computed } from "vue";
import { useConfigStore } from "./config";
import { useDiscoveryStore } from "./discovery";

export const useFavoritesStore = defineStore("favorites", () => {
	const config = useConfigStore();
	const discovery = useDiscoveryStore();

	const entries = () => {
		if (!Array.isArray(config.persistent.favorites)) {
			config.persistent.favorites = [];
		}
		return config.persistent.favorites;
	};

	const ids = computed(() => new Set(entries().map((entry) => entry.id)));
	const count = computed(() => entries().length);

	const isFavorite = (stream) => !!stream?.id && ids.value.has(stream.id);

	// An entry whose stream is not being announced stays listed and is marked
	// offline: the operator needs to see that a configured channel is gone,
	// not an empty page.
	const resolved = computed(() =>
		[...entries()]
			.sort((a, b) => a.order - b.order)
			.map((entry) => {
				const stream = discovery.streamById(entry.id);
				return {
					id: entry.id,
					order: entry.order,
					stream,
					online: !!stream,
					name: config.nameOf(entry.id) || stream?.name || entry.id,
					playable: discovery.canPlay(stream),
					unsupported: !!stream && !stream.isSupported,
				};
			}),
	);

	const renumber = () => {
		entries().forEach((entry, index) => {
			entry.order = index;
		});
	};

	const add = (stream) => {
		if (!stream?.id || isFavorite(stream)) return;
		entries().push({ id: stream.id, order: entries().length });
	};

	const remove = (id) => {
		const list = entries();
		const index = list.findIndex((entry) => entry.id === id);
		if (index === -1) return;
		list.splice(index, 1);
		renumber();
	};

	const toggle = (stream) => {
		if (isFavorite(stream)) remove(stream.id);
		else add(stream);
	};

	// Takes the ids in their new display order
	const reorder = (orderedIds) => {
		const list = entries();
		const byId = new Map(list.map((entry) => [entry.id, entry]));
		const next = orderedIds
			.map((id) => byId.get(id))
			.filter((entry) => entry !== undefined);
		for (const entry of list) {
			if (!orderedIds.includes(entry.id)) next.push(entry);
		}
		config.persistent.favorites = next;
		renumber();
	};

	return { ids, count, isFavorite, resolved, add, remove, toggle, reorder };
});
