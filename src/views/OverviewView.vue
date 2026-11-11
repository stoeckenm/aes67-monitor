<template>
	<!-- Anything that stops the app from working is said here, not left for the
  admin to infer from an empty list three pages away. -->
	<div v-if="hints.length" class="overview-hints">
		<div
			v-for="hint in hints"
			:key="hint"
			class="alert alert-warning d-flex align-items-start gap-2"
		>
			<i class="bi bi-exclamation-triangle-fill mt-1"></i>
			<div>{{ t(hint) }}</div>
		</div>
	</div>

	<div class="overview">
		<section class="overview-card">
			<h2 class="overview-title">
				<i class="bi bi-ethernet"></i> {{ t("overview.network") }}
			</h2>
			<dl class="overview-list">
				<dt>{{ t("overview.interface") }}</dt>
				<dd>
					<template v-if="discovery.activeInterface">
						{{ discovery.activeInterface.name
						}}<template v-if="discovery.activeInterface.name">: </template
						>{{ discovery.activeInterface.address }}
					</template>
					<span v-else class="text-muted">{{
						t("overview.interfaceNone")
					}}</span>
				</dd>

				<dt>{{ t("overview.lastUpdate") }}</dt>
				<dd>{{ t(age.key, age.params) }}</dd>
			</dl>
			<button
				type="button"
				class="btn btn-sm btn-outline-secondary"
				@click="session.setPage('settings')"
			>
				{{ t("overview.goSettings") }}
			</button>
		</section>

		<section class="overview-card">
			<h2 class="overview-title">
				<i class="bi bi-speaker"></i> {{ t("overview.discovery") }}
			</h2>
			<p class="overview-figure">{{ discovery.streams.length }}</p>
			<dl class="overview-list">
				<dt>{{ t("overview.playable") }}</dt>
				<dd>{{ discovery.playableCount }}</dd>
				<dt>{{ t("overview.unsupported") }}</dt>
				<dd>{{ discovery.unsupportedCount }}</dd>
				<dt>{{ t("overview.manual") }}</dt>
				<dd>{{ discovery.manualCount }}</dd>
			</dl>
			<button
				type="button"
				class="btn btn-sm btn-outline-secondary"
				@click="session.setPage('streams')"
			>
				{{ t("overview.goStreams") }}
			</button>
		</section>

		<section class="overview-card">
			<h2 class="overview-title">
				<i class="bi bi-hdd-network"></i> {{ t("overview.senders") }}
			</h2>
			<p class="overview-figure">{{ discovery.senderCount }}</p>
			<button
				type="button"
				class="btn btn-sm btn-outline-secondary"
				@click="session.setPage('senders')"
			>
				{{ t("overview.goSenders") }}
			</button>
		</section>

		<section class="overview-card">
			<h2 class="overview-title">
				<i class="bi bi-star-fill"></i> {{ t("overview.channels") }}
			</h2>
			<p class="overview-figure">{{ channels.count }}</p>
			<dl class="overview-list">
				<dt>{{ t("overview.channelsOnline") }}</dt>
				<dd>{{ channels.onlineCount }}</dd>
				<dt>{{ t("overview.channelsOffline") }}</dt>
				<dd
					:class="{
						'text-danger-emphasis': channels.offlineCount > 0,
					}"
				>
					{{ channels.offlineCount }}
				</dd>
			</dl>
			<button
				type="button"
				class="btn btn-sm btn-outline-secondary"
				@click="session.setPage('channels')"
			>
				{{ t("overview.goChannels") }}
			</button>
		</section>

		<section class="overview-card">
			<h2 class="overview-title">
				<i class="bi bi-volume-up"></i> {{ t("overview.playback") }}
			</h2>
			<dl class="overview-list">
				<dt>{{ t("overview.output") }}</dt>
				<dd>
					<template v-if="config.settings.followSystemAudio">
						{{ t("overview.outputFollowSystem") }}
					</template>
					<template v-else-if="discovery.currentOutput">
						{{ discovery.currentOutput.name }}
					</template>
					<span v-else class="text-muted">{{ t("overview.outputNone") }}</span>
				</dd>

				<dt>{{ t("overview.playingNow") }}</dt>
				<dd>
					<span v-if="playingName" class="text-success-emphasis fw-semibold">
						<i class="bi bi-broadcast"></i> {{ playingName }}
					</span>
					<span v-else class="text-muted">{{
						t("overview.playingNothing")
					}}</span>
				</dd>
			</dl>
		</section>
	</div>
</template>

<script setup>
// Answers the question an admin has first: is it listening on the right
// adapter, is it hearing anything, and will an operator see something? None of
// that had a place on screen before.
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { useChannelsStore } from "../stores/channels";
import { usePlaybackStore } from "../stores/playback";
import { ageLabel } from "../utils/relativeTime";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const channels = useChannelsStore();
const playback = usePlaybackStore();

// The age label needs a clock of its own. Five seconds is coarse enough not to
// put the idle load back that phase 2 of the overhaul removed, and the timer
// only runs while this page is open.
const now = ref(Date.now());
let timer = null;
onMounted(() => {
	timer = setInterval(() => {
		now.value = Date.now();
	}, 5000);
});
onUnmounted(() => {
	clearInterval(timer);
});

const age = computed(() => ageLabel(discovery.lastUpdate, now.value));

const playingName = computed(() => {
	if (!playback.playingId) return "";
	return discovery.displayName(discovery.streamById(playback.playingId));
});

const hints = computed(() => {
	const list = [];
	if (!discovery.activeInterface) list.push("overview.hintNoInterface");
	if (discovery.outputDevices.length === 0) list.push("overview.hintNoOutput");
	if (discovery.streams.length === 0) list.push("overview.hintNoStreams");
	if (channels.count === 0) list.push("overview.hintNoChannels");
	return list;
});
</script>

<style scoped>
.overview-hints {
	max-width: 48rem;
}
.overview {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
	gap: 1rem;
	align-items: start;
}
.overview-card {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 1.1rem 1.25rem;
	border: 1px solid var(--sm-border);
	border-radius: 0.75rem;
	background: var(--sm-surface);
}
.overview-title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
}
.overview-figure {
	margin: 0;
	font-size: 2.25rem;
	font-weight: 600;
	line-height: 1;
}
.overview-list {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.2rem 0.75rem;
	margin: 0;
	width: 100%;
	font-size: 0.9rem;
}
.overview-list dt {
	font-weight: 400;
	color: var(--sm-muted);
}
.overview-list dd {
	margin: 0;
	text-align: right;
	overflow-wrap: anywhere;
}
</style>
