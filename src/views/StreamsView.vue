<template>
	<div class="streams-toolbar">
		<div class="form-check mb-0">
			<input
				id="show-unsupported"
				v-model="showUnsupported"
				class="form-check-input"
				type="checkbox"
			/>
			<label class="form-check-label" for="show-unsupported">
				{{ t("streams.showUnsupported") }}
			</label>
		</div>

		<!-- The sender filter is shown as its own removable chip. It used to be
    written into the search box, where it was indistinguishable from a term the
    user had typed. -->
		<span v-if="session.senderFilter" class="badge text-bg-secondary chip">
			{{ t("streams.senderFilter", { sender: session.senderFilter }) }}
			<button
				type="button"
				class="btn-close btn-close-white chip-close"
				:aria-label="t('streams.senderFilterClear')"
				:title="t('streams.senderFilterClear')"
				@click="session.clearSenderFilter()"
			></button>
		</span>
	</div>

	<div v-if="discovery.visibleCount === 0" class="alert alert-secondary">
		{{ t("streams.empty") }}
		<span v-if="discovery.streams.length === 0">
			{{ t("streams.emptyHint") }}
		</span>
	</div>

	<div v-else class="table-responsive">
		<table class="table table-sm align-middle">
			<thead>
				<tr>
					<th v-for="column in columns" :key="column.key" scope="col">
						<button
							type="button"
							class="sort-button"
							:aria-sort="ariaSort(column.key)"
							@click="setSort(column.key)"
						>
							{{ t(column.label) }}
							<i
								v-if="sortKey === column.key"
								class="bi"
								:class="sortAsc ? 'bi-caret-up-fill' : 'bi-caret-down-fill'"
							></i>
						</button>
					</th>
					<th scope="col" class="text-end">
						<span class="visually-hidden">{{ t("streams.details") }}</span>
					</th>
				</tr>
			</thead>

			<tbody>
				<tr v-for="stream in sorted" :key="stream.id">
					<td>{{ config.nameOf(stream.id) || "–" }}</td>
					<td>{{ stream.name }}</td>
					<td>
						<span v-if="stream.dante" class="badge text-bg-primary me-1">
							{{ t("streams.tags.dante") }}
						</span>
						<span
							v-if="stream.groups?.[0]?.type === 'DUP'"
							class="badge text-bg-primary me-1"
						>
							{{ t("streams.tags.redundant") }}
						</span>
						<span v-if="stream.manual" class="badge text-bg-secondary me-1">
							{{ t("streams.tags.manual") }}
						</span>
						<span v-if="stream.announce" class="badge text-bg-secondary me-1">
							{{ t("streams.tags.sap") }}
						</span>
					</td>
					<td>{{ stream.media?.[0]?.description || "–" }}</td>
					<td>{{ stream.origin?.address || t("streams.notAvailable") }}</td>
					<td>
						<span v-if="stream.isSupported">
							{{ stream.codec }} / {{ stream.samplerate }} Hz /
							{{ stream.channels }}
						</span>
						<span v-else class="text-muted">–</span>
					</td>
					<td>
						<!-- Why a stream cannot be played is a fact about the stream, so it
            belongs in its own column rather than hidden in the format cell. -->
						<span v-if="!stream.isSupported" class="text-danger-emphasis">
							{{ stream.unsupportedReason || t("streams.notSupported") }}
						</span>
						<span
							v-else-if="!discovery.canPlay(stream)"
							class="text-danger-emphasis"
						>
							{{ t("streams.wrongSampleRate") }}
						</span>
						<span v-else class="text-success-emphasis">
							{{ t("streams.playable") }}
						</span>
					</td>
					<td class="text-end text-nowrap">
						<button
							v-if="stream.isSupported"
							type="button"
							class="btn btn-sm me-1"
							:class="
								playback.isPlaying(stream.id) ? 'btn-danger' : 'btn-success'
							"
							:disabled="!discovery.canPlay(stream)"
							:title="
								playback.isPlaying(stream.id)
									? t('channels.stop')
									: t('channels.listen')
							"
							@click="playback.play(stream)"
						>
							<i
								class="bi"
								:class="
									playback.isPlaying(stream.id)
										? 'bi-stop-fill'
										: 'bi-play-fill'
								"
							></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-warning me-1"
							:title="
								channels.isChannel(stream)
									? t('streams.removeChannel')
									: t('streams.addChannel')
							"
							:aria-label="
								channels.isChannel(stream)
									? t('streams.removeChannel')
									: t('streams.addChannel')
							"
							@click="channels.toggle(stream)"
						>
							<i
								class="bi"
								:class="
									channels.isChannel(stream)
										? 'bi-star-fill text-warning'
										: 'bi-star'
								"
							></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-primary"
							:title="t('streams.details')"
							:aria-label="t('streams.details')"
							@click="session.openStream(stream.id)"
						>
							<i class="bi bi-info-circle"></i>
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup>
// Discovery only: what is on the network and what state it is in. Which media
// entry and which channel pair to play moved to the stream detail page and the
// channel editor — they are playback configuration and had no business in a
// table that is read to find things.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { useChannelsStore } from "../stores/channels";
import { usePlaybackStore } from "../stores/playback";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const channels = useChannelsStore();
const playback = usePlaybackStore();

// One definition instead of seven near identical header blocks
const columns = [
	{ key: "displayName", label: "streams.columns.displayName" },
	{ key: "name", label: "streams.columns.name" },
	{ key: "tags", label: "streams.columns.tags" },
	{ key: "info", label: "streams.columns.info" },
	{ key: "sender", label: "streams.columns.sender" },
	{ key: "format", label: "streams.columns.format" },
	{ key: "state", label: "streams.columns.state" },
];

const sortKey = ref("name");
const sortAsc = ref(true);

const setSort = (key) => {
	if (sortKey.value === key) sortAsc.value = !sortAsc.value;
	else {
		sortKey.value = key;
		sortAsc.value = true;
	}
};

const ariaSort = (key) => {
	if (sortKey.value !== key) return "none";
	return sortAsc.value ? "ascending" : "descending";
};

const showUnsupported = computed({
	get: () => !config.settings.hideUnsupported,
	set: (value) => {
		config.settings.hideUnsupported = !value;
	},
});

const sortValue = (stream, key) => {
	switch (key) {
		case "displayName":
			return config.nameOf(stream.id);
		case "name":
			return stream.name || "";
		case "sender":
			return stream.origin?.address || "";
		case "info":
			return stream.media?.[0]?.description || "";
		case "format":
			return stream.isSupported
				? `${stream.codec} ${stream.samplerate} ${stream.channels}`
				: "";
		case "state":
			// Sorts playable first, then wrong rate, then unsupported
			if (!stream.isSupported) return "3";
			return discovery.canPlay(stream) ? "1" : "2";
		case "tags":
			return [
				stream.dante && "Dante",
				stream.groups?.[0]?.type === "DUP" && "2022-7",
				stream.manual && "Manual",
				stream.announce && "SAP",
			]
				.filter(Boolean)
				.join(" ");
		default:
			return "";
	}
};

const sorted = computed(() => {
	const starred = channels.ids;
	const direction = sortAsc.value ? 1 : -1;
	return [...discovery.filtered].sort((a, b) => {
		// Configured channels stay at the top whatever the sort
		const aChannel = starred.has(a.id);
		const bChannel = starred.has(b.id);
		if (aChannel !== bChannel) return aChannel ? -1 : 1;

		const left = String(sortValue(a, sortKey.value)).toLowerCase();
		const right = String(sortValue(b, sortKey.value)).toLowerCase();
		if (left === right) return 0;
		return left < right ? -direction : direction;
	});
});
</script>

<style scoped>
.streams-toolbar {
	display: flex;
	align-items: center;
	gap: 1rem;
	margin-bottom: 0.75rem;
	flex-wrap: wrap;
}
.chip {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.85rem;
}
.chip-close {
	font-size: 0.6rem;
	padding: 0;
}
.sort-button {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0;
	border: 0;
	background: none;
	color: inherit;
	font: inherit;
	font-weight: 600;
	cursor: pointer;
}
.sort-button:hover {
	color: var(--bs-primary);
}
</style>
