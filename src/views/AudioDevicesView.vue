<template>
	<p class="text-muted audio-intro">{{ t("audio.intro") }}</p>

	<!-- What is in effect and why. A selection that cannot take effect is said
  out loud instead of being silently ignored, which is how the preferred
  device used to make the list look broken. -->
	<div
		class="alert d-flex align-items-start gap-2"
		:class="sentenceClass"
		role="status"
	>
		<i class="bi mt-1" :class="sentenceIcon"></i>
		<div>{{ t(sentence.key, sentence.params) }}</div>
	</div>

	<div class="form-check mb-3">
		<input
			id="follow-system"
			v-model="followSystem"
			class="form-check-input"
			type="checkbox"
		/>
		<label class="form-check-label" for="follow-system">
			{{ t("audio.followSystem") }}
		</label>
		<div class="form-text">{{ t("audio.followSystemHint") }}</div>
	</div>

	<p v-if="discovery.outputDevices.length === 0" class="text-muted">
		{{ t("audio.noDevice") }}
	</p>

	<div v-else class="table-responsive">
		<table class="table table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">{{ t("audio.columnName") }}</th>
					<th scope="col">{{ t("audio.columnChannels") }}</th>
					<th scope="col">{{ t("audio.columnRates") }}</th>
					<th scope="col" class="text-end"></th>
				</tr>
			</thead>
			<tbody>
				<tr
					v-for="device in discovery.outputDevices"
					:key="device.name"
					:class="{ 'device-absent': device.absent }"
				>
					<td>
						<span class="device-name">{{ device.name }}</span>
						<span
							v-for="badge in badgesFor(device)"
							:key="badge.key"
							class="badge ms-1"
							:class="badge.variant"
						>
							{{ t(badge.key)
							}}<template v-if="badge.suffixKey">
								({{ t(badge.suffixKey) }})</template
							>
						</span>
					</td>
					<td>{{ device.outputChannels }}</td>
					<td class="device-rates">
						{{
							device.sampleRates?.length ? device.sampleRates.join(", ") : "–"
						}}
					</td>
					<td class="text-end text-nowrap">
						<button
							type="button"
							class="btn btn-sm btn-outline-primary me-1"
							:disabled="followSystem || device.absent || device.isCurrent"
							:title="t('audio.use')"
							@click="playback.selectOutputDevice(device)"
						>
							{{ device.isCurrent ? t("audio.inUse") : t("audio.use") }}
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-warning"
							:title="device.isPinned ? t('audio.unprefer') : t('audio.prefer')"
							:aria-label="
								device.isPinned ? t('audio.unprefer') : t('audio.prefer')
							"
							@click="togglePreferred(device)"
						>
							<i
								class="bi"
								:class="
									device.isPinned ? 'bi-star-fill text-warning' : 'bi-star'
								"
							></i>
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</div>

	<p class="form-text audio-hint">{{ t("audio.preferHint") }}</p>
</template>

<script setup>
// The preferred output device, which is what makes a USB headset take over
// again by itself once it is plugged back in. The precedence is decided in
// backend/system/audioSelection.js; this page only shows the answer and asks
// main for changes.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { usePlaybackStore } from "../stores/playback";
import { selectionSentence, deviceBadges } from "../utils/audioStatus";

const { t } = useI18n();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const playback = usePlaybackStore();

const followSystem = computed({
	get: () => config.settings.followSystemAudio,
	set: (value) => {
		config.settings.followSystemAudio = value;
		// Re-resolve immediately rather than at the next poll
		playback.selectOutputDevice(value ? null : discovery.currentOutput || null);
	},
});

const sentence = computed(() => selectionSentence(discovery.audioSelection));

const sentenceClass = computed(() => {
	const reason = discovery.audioSelection?.reason;
	if (reason === "none") return "alert-danger";
	if (reason === "fallback") return "alert-warning";
	return "alert-secondary";
});

const sentenceIcon = computed(() => {
	const reason = discovery.audioSelection?.reason;
	if (reason === "none") return "bi-x-octagon-fill";
	if (reason === "fallback") return "bi-exclamation-triangle-fill";
	return "bi-info-circle";
});

const badgesFor = (device) => deviceBadges(device, followSystem.value);

const togglePreferred = (device) => {
	playback.setPreferredOutputDevice(device.isPinned ? null : device);
};
</script>

<style scoped>
.audio-intro {
	margin-bottom: 0.75rem;
}
.device-name {
	font-weight: 500;
}
.device-rates {
	font-variant-numeric: tabular-nums;
	font-size: 0.9rem;
}
.device-absent {
	opacity: 0.6;
}
.audio-hint {
	max-width: 44rem;
}
</style>
