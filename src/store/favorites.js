// renderer/store/favorites.js
//
// A favorite is a reference: { id, order }. Live stream data is resolved
// against discovery on demand, so a favorite is never played from a snapshot
// taken when it was starred.
import { computed } from "vue";
import { streams, persistentData, playing } from "./state";
import { savePersistentConfig } from "./config";
import { getStreamName } from "./actions";

const list = () => {
	if (!Array.isArray(persistentData.value.favorites)) {
		persistentData.value.favorites = [];
	}
	return persistentData.value.favorites;
};

export const favoriteIds = computed(
	() => new Set(list().map((entry) => entry.id)),
);

export const favoriteCount = computed(() => list().length);

export const isFavorite = (stream) =>
	!!stream?.id && favoriteIds.value.has(stream.id);

// Each favorite joined with the stream currently on the network. An entry
// whose stream is not being announced stays visible but is marked offline,
// so the operator sees the channel is gone rather than an empty page.
export const resolvedFavorites = computed(() => {
	const byId = new Map(streams.value.map((s) => [s.id, s]));
	return [...list()]
		.sort((a, b) => a.order - b.order)
		.map((entry) => {
			const stream = byId.get(entry.id) || null;
			return {
				id: entry.id,
				order: entry.order,
				stream,
				online: !!stream,
				name:
					(stream && getStreamName(stream)) ||
					persistentData.value.streamNames?.[entry.id] ||
					stream?.name ||
					entry.id,
				playable: !!stream && !!stream.isSupported,
			};
		});
});

const renumber = () => {
	list().forEach((entry, index) => {
		entry.order = index;
	});
};

export const addFavorite = (stream) => {
	if (!stream?.id || isFavorite(stream)) return;
	list().push({ id: stream.id, order: list().length });
	savePersistentConfig();
};

export const removeFavorite = (id) => {
	const entries = list();
	const index = entries.findIndex((entry) => entry.id === id);
	if (index === -1) return;
	entries.splice(index, 1);
	renumber();
	savePersistentConfig();
};

export const toggleFavorite = (stream) => {
	if (isFavorite(stream)) removeFavorite(stream.id);
	else addFavorite(stream);
};

// Takes the ids in their new display order, as produced by the drag handler.
export const reorderFavorites = (orderedIds) => {
	const entries = list();
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const reordered = orderedIds
		.map((id) => byId.get(id))
		.filter((entry) => entry !== undefined);
	// Anything the caller did not mention keeps its relative position at the end
	for (const entry of entries) {
		if (!orderedIds.includes(entry.id)) reordered.push(entry);
	}
	persistentData.value.favorites = reordered;
	renumber();
	savePersistentConfig();
};

export const isPlaying = (id) => playing.value === id;
