<template>
	<div class="streams-toolbar form-check">
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
							v-if="column.sortable"
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
						<span v-else>{{ t(column.label) }}</span>
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
						<span v-else class="text-danger-emphasis">
							{{ stream.unsupportedReason || t("streams.notSupported") }}
						</span>
					</td>
					<td>
						<select
							v-if="stream.media?.length > 1 && stream.isSupported"
							v-model="playback.mediaByStream[stream.id]"
							class="form-select form-select-sm"
							:disabled="playback.isPlaying(stream.id)"
							:aria-label="t('streams.columns.multicast')"
						>
							<option
								v-for="(media, index) in stream.media"
								:key="index"
								:value="index"
							>
								{{ media.connection?.ip?.split("/")[0] || stream.mcast }}:{{
									media.port
								}}
							</option>
						</select>
						<span v-else>
							{{ stream.mcast }}:{{
								stream.media?.[0]?.port || t("streams.notAvailable")
							}}
						</span>
					</td>
					<td>
						<select
							v-if="stream.isSupported"
							v-model="playback.channelByStream[stream.id]"
							class="form-select form-select-sm"
							:disabled="playback.isPlaying(stream.id)"
							:aria-label="t('streams.columns.channel')"
						>
							<option
								v-for="option in playback.channelOptions(stream)"
								:key="option.value"
								:value="option.value"
							>
								{{ channelLabel(option) }}
							</option>
						</select>
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
									? t('operator.stop')
									: t('operator.listen')
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
								favorites.isFavorite(stream)
									? t('streams.unfavorite')
									: t('streams.favorite')
							"
							@click="favorites.toggle(stream)"
						>
							<i
								class="bi"
								:class="
									favorites.isFavorite(stream)
										? 'bi-star-fill text-warning'
										: 'bi-star'
								"
							></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-primary"
							:title="t('streams.details')"
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
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { useFavoritesStore } from "../stores/favorites";
import { usePlaybackStore } from "../stores/playback";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const favorites = useFavoritesStore();
const playback = usePlaybackStore();

// One definition instead of six near identical header blocks
const columns = [
	{ key: "displayName", label: "streams.columns.displayName", sortable: true },
	{ key: "name", label: "streams.columns.name", sortable: true },
	{ key: "tags", label: "streams.columns.tags", sortable: true },
	{ key: "info", label: "streams.columns.info", sortable: true },
	{ key: "address", label: "streams.columns.address", sortable: true },
	{ key: "format", label: "streams.columns.format", sortable: true },
	{ key: "multicast", label: "streams.columns.multicast", sortable: false },
	{ key: "channel", label: "streams.columns.channel", sortable: false },
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
		case "address":
			return stream.origin?.address || "";
		case "info":
			return stream.media?.[0]?.description || "";
		case "format":
			return stream.isSupported
				? `${stream.codec} ${stream.samplerate} ${stream.channels}`
				: "";
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
	const starred = favorites.ids;
	const direction = sortAsc.value ? 1 : -1;
	return [...discovery.filtered].sort((a, b) => {
		// Starred channels stay at the top whatever the sort
		const aFav = starred.has(a.id);
		const bFav = starred.has(b.id);
		if (aFav !== bFav) return aFav ? -1 : 1;

		const left = String(sortValue(a, sortKey.value)).toLowerCase();
		const right = String(sortValue(b, sortKey.value)).toLowerCase();
		if (left === right) return 0;
		return left < right ? -direction : direction;
	});
});

const channelLabel = (option) =>
	option.kind === "stereo"
		? t("streams.channelStereo", { first: option.first, second: option.second })
		: t("streams.channelMono", { channel: option.channel });
</script>

<style scoped>
.streams-toolbar {
	margin-bottom: 0.75rem;
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
