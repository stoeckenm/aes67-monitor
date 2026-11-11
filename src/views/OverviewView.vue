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
						<!-- A preferred device that is unplugged is worth seeing here:
						playback works, but not on the device that was asked for. -->
						<span
							v-if="discovery.audioSelection?.reason === 'fallback'"
							class="badge text-bg-warning ms-1"
						>
							{{ t("overview.outputPreferredAway") }}
						</span>
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
	max-width: 52rem;
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
	margin-bottom: 1.25rem;
}
.overview-hints .alert {
	margin: 0;
}
.overview {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	gap: 1.1rem;
	align-items: start;
}
.overview-card {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.85rem;
	padding: 1.25rem 1.35rem 1.35rem;
	border: 1px solid var(--sm-border);
	border-radius: var(--sm-radius-lg);
	background: var(--sm-surface);
	box-shadow: var(--sm-shadow-sm);
	transition:
		box-shadow 0.18s ease,
		transform 0.18s ease;
}
.overview-card:hover {
	box-shadow: var(--sm-shadow);
	transform: translateY(-2px);
}
.overview-title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0;
	font-size: 0.8rem;
	font-weight: 600;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	color: var(--sm-muted);
}
.overview-title .bi {
	font-size: 1rem;
	color: var(--sm-accent);
	line-height: 1;
}
.overview-figure {
	margin: 0;
	font-size: 2.6rem;
	font-weight: 600;
	line-height: 1;
	letter-spacing: -0.03em;
	font-variant-numeric: tabular-nums;
}
.overview-list {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.3rem 0.75rem;
	margin: 0;
	width: 100%;
	font-size: 0.92rem;
}
.overview-list dt {
	font-weight: 400;
	color: var(--sm-muted);
}
.overview-list dd {
	margin: 0;
	text-align: right;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}
/* The buttons are a way out of the card, not its point. */
.overview-card .btn {
	margin-top: auto;
	--bs-btn-font-size: 0.88rem;
}
</style>
