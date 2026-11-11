// stores/channels.js
//
// A channel is a reference, { id, order }. Live data is resolved against
// discovery, so a channel is never played from a snapshot taken when it was
// created.
//
// The persisted key is still `favorites`: the stored shape is unchanged, only
// the vocabulary is. Renaming the key would need a migration for no gain the
// user can see.
import { defineStore } from "pinia";
import { computed } from "vue";
import { useConfigStore } from "./config";
import { useDiscoveryStore } from "./discovery";

export const useChannelsStore = defineStore("channels", () => {
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

	const isChannel = (stream) => !!stream?.id && ids.value.has(stream.id);

	// An entry whose stream is not being announced stays listed and is marked
	// offline: the operator needs to see that a configured channel is gone,
	// not an empty page.
	const resolved = computed(() =>
		[...entries()]
			.sort((a, b) => a.order - b.order)
			.map((entry, index) => {
				const stream = discovery.streamById(entry.id);
				return {
					id: entry.id,
					order: entry.order,
					position: index + 1,
					stream,
					online: !!stream,
					name: config.nameOf(entry.id) || stream?.name || entry.id,
					// What the admin needs to recognise the source behind the label
					hasOwnName: !!config.nameOf(entry.id),
					sourceName: stream?.name || "",
					sender: stream?.origin?.address || "",
					playable: discovery.canPlay(stream),
					unsupported: !!stream && !stream.isSupported,
				};
			}),
	);

	const onlineCount = computed(
		() => resolved.value.filter((channel) => channel.online).length,
	);
	const offlineCount = computed(() => count.value - onlineCount.value);

	const renumber = () => {
		entries().forEach((entry, index) => {
			entry.order = index;
		});
	};

	const add = (stream) => {
		if (!stream?.id || isChannel(stream)) return;
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
		if (isChannel(stream)) remove(stream.id);
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

	// One step up or down, for the admin list where dragging a table row is
	// fiddlier than pressing a button
	const move = (id, delta) => {
		const ordered = resolved.value.map((channel) => channel.id);
		const from = ordered.indexOf(id);
		const to = from + delta;
		if (from === -1 || to < 0 || to >= ordered.length) return;
		ordered.splice(to, 0, ordered.splice(from, 1)[0]);
		reorder(ordered);
	};

	return {
		ids,
		count,
		onlineCount,
		offlineCount,
		isChannel,
		resolved,
		add,
		remove,
		toggle,
		reorder,
		move,
	};
});
