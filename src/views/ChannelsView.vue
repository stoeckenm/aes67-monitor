<template>
	<div v-if="channels.resolved.length === 0" class="channels-empty">
		<div class="channels-empty-icon">
			<i class="bi bi-music-note-list"></i>
		</div>
		<p class="channels-empty-text">{{ t("channels.empty") }}</p>
		<p class="channels-empty-hint">
			{{ editable ? t("channels.admin.emptyHint") : t("channels.emptyHint") }}
		</p>
	</div>

	<draggable
		v-else
		v-model="order"
		item-key="id"
		:disabled="!editable"
		class="channels"
		@end="commitOrder"
	>
		<template #item="{ element: channel }">
			<article
				class="channel"
				:class="{
					'is-offline': !channel.online,
					'is-blocked': channel.online && !channel.playable,
					'is-playing': playback.isPlaying(channel.id),
					'is-draggable': editable,
				}"
			>
				<!-- State first and in words: an operator has to be able to tell at a
        glance whether a channel can be listened to at all. -->
				<p class="channel-state">
					<span class="channel-dot" aria-hidden="true"></span>
					<span class="channel-state-text">{{ stateLabel(channel) }}</span>
				</p>

				<h2 class="channel-name" :title="channel.name">
					{{ channel.name }}
				</h2>

				<button
					type="button"
					class="channel-button"
					:class="playback.isPlaying(channel.id) ? 'is-stop' : 'is-play'"
					:disabled="!channel.playable"
					@click="toggle(channel)"
				>
					<i
						class="bi"
						:class="
							playback.isPlaying(channel.id) ? 'bi-stop-fill' : 'bi-play-fill'
						"
					></i>
					<span class="channel-button-label">
						{{
							playback.isPlaying(channel.id)
								? t("channels.stop")
								: t("channels.listen")
						}}
					</span>
				</button>
			</article>
		</template>
	</draggable>
</template>

<script setup>
// The operator's whole screen. The admin side reuses it read-only as a preview
// and may enable dragging, but everything that configures a channel lives in
// ChannelsAdminView: this component used to branch on adminMode in four
// places and served two audiences at once.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import draggable from "vuedraggable";
import { useChannelsStore } from "../stores/channels";
import { usePlaybackStore } from "../stores/playback";

const props = defineProps({
	editable: { type: Boolean, default: false },
});

const { t } = useI18n();
const channels = useChannelsStore();
const playback = usePlaybackStore();

// Local mirror for the drag handler, kept in step with the store
const order = ref([...channels.resolved]);
watch(
	() => channels.resolved,
	(next) => {
		order.value = [...next];
	},
);

const commitOrder = () => {
	if (!props.editable) return;
	channels.reorder(order.value.map((channel) => channel.id));
};

const toggle = (channel) => {
	if (playback.isPlaying(channel.id)) {
		playback.stop();
		return;
	}
	if (channel.stream) playback.play(channel.stream);
};

const stateLabel = (channel) => {
	if (!channel.online) return t("channels.offline");
	if (!channel.playable) return t("channels.unsupportedFormat");
	if (playback.isPlaying(channel.id)) return t("channels.playing");
	return t("channels.ready");
};
</script>

<style scoped>
.channels {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
	gap: 1.25rem;
}

.channel {
	display: flex;
	flex-direction: column;
	gap: 0.6rem;
	padding: 1.35rem 1.35rem 1.2rem;
	border: 1px solid var(--sm-border);
	border-radius: var(--sm-radius-lg);
	background: var(--sm-surface);
	box-shadow: var(--sm-shadow-sm);
	transition:
		box-shadow 0.18s ease,
		transform 0.18s ease,
		border-color 0.18s ease,
		background-color 0.18s ease;
}
.channel:hover {
	box-shadow: var(--sm-shadow);
	transform: translateY(-2px);
}

/* --- state line --- */
.channel-state {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0;
	font-size: 0.78rem;
	font-weight: 600;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	color: var(--sm-muted);
}
.channel-dot {
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 50%;
	background: var(--sm-border-strong);
	flex-shrink: 0;
}
.channel-state-text {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* --- name --- */
.channel-name {
	margin: 0;
	font-size: 1.45rem;
	font-weight: 600;
	line-height: 1.2;
	letter-spacing: -0.015em;
	/* Channel names come from the installation and can be long. Two lines beat
     an ellipsis on the first word that does not fit. */
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	word-break: break-word;
}

/* --- the one control an operator uses --- */
.channel-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	width: 100%;
	min-height: 3.4rem;
	margin-top: auto;
	padding: 0 1rem;
	border: 1px solid transparent;
	border-radius: var(--sm-radius);
	font-size: 1.1rem;
	font-weight: 600;
	cursor: pointer;
	transition:
		background-color 0.15s ease,
		color 0.15s ease,
		box-shadow 0.15s ease,
		transform 0.08s ease;
}
.channel-button .bi {
	font-size: 1.3rem;
	line-height: 1;
}
.channel-button:active:not(:disabled) {
	transform: translateY(1px);
}
.channel-button:focus-visible {
	outline: 2px solid var(--sm-accent);
	outline-offset: 2px;
}
.channel-button.is-play {
	background: var(--sm-live);
	color: #fff;
	box-shadow: var(--sm-shadow-sm);
}
.channel-button.is-play:hover:not(:disabled) {
	filter: brightness(1.08);
}
.channel-button.is-stop {
	background: var(--sm-danger);
	color: #fff;
	box-shadow: var(--sm-shadow-sm);
}
.channel-button.is-stop:hover {
	filter: brightness(1.08);
}
.channel-button:disabled {
	background: var(--sm-surface-2);
	color: var(--sm-muted);
	cursor: not-allowed;
	box-shadow: none;
}

/* --- states --- */
.channel.is-playing {
	border-color: var(--sm-live);
	background:
		linear-gradient(var(--sm-live-soft), var(--sm-live-soft)), var(--sm-surface);
	box-shadow: var(--sm-shadow);
}
.channel.is-playing .channel-state {
	color: var(--sm-live);
}
.channel.is-playing .channel-dot {
	background: var(--sm-live);
	animation: channel-pulse 1.8s ease-in-out infinite;
}
.channel.is-offline {
	background: var(--sm-surface-2);
}
.channel.is-offline .channel-name {
	color: var(--sm-muted);
}
.channel.is-offline .channel-dot,
.channel.is-blocked .channel-dot {
	background: var(--sm-warn);
}
.channel.is-offline .channel-state,
.channel.is-blocked .channel-state {
	color: var(--sm-warn);
}
.channel.is-draggable {
	cursor: grab;
	border-style: dashed;
}
.channel.is-draggable:active {
	cursor: grabbing;
}

@keyframes channel-pulse {
	0%,
	100% {
		opacity: 1;
		box-shadow: 0 0 0 0 var(--sm-live-soft);
	}
	50% {
		opacity: 0.75;
		box-shadow: 0 0 0 0.3rem var(--sm-live-soft);
	}
}

/* --- empty --- */
.channels-empty {
	max-width: 32rem;
	margin: 5rem auto;
	text-align: center;
}
.channels-empty-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 4.5rem;
	height: 4.5rem;
	border-radius: 50%;
	background: var(--sm-surface-2);
	color: var(--sm-muted);
	font-size: 1.9rem;
}
.channels-empty-text {
	margin: 1.25rem 0 0.35rem;
	font-size: 1.35rem;
	font-weight: 600;
}
.channels-empty-hint {
	margin: 0;
	color: var(--sm-muted);
}

@media (max-width: 520px) {
	.channels {
		grid-template-columns: 1fr;
	}
}
</style>
