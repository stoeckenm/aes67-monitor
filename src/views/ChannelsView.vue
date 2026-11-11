<template>
	<div v-if="channels.resolved.length === 0" class="channels-empty">
		<i class="bi bi-music-note-list channels-empty-icon"></i>
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
					'channel-offline': !channel.online,
					'channel-playing': playback.isPlaying(channel.id),
					'channel-draggable': editable,
				}"
			>
				<div class="channel-body">
					<h2 class="channel-name" :title="channel.name">
						{{ channel.name }}
					</h2>

					<p v-if="!channel.online" class="channel-state channel-state-warn">
						<i class="bi bi-slash-circle"></i>
						{{ t("channels.offline") }}
					</p>
					<p
						v-else-if="!channel.playable"
						class="channel-state channel-state-warn"
					>
						<i class="bi bi-exclamation-triangle"></i>
						{{ t("channels.unsupportedFormat") }}
					</p>
					<p
						v-else-if="playback.isPlaying(channel.id)"
						class="channel-state channel-state-live"
					>
						<i class="bi bi-broadcast"></i>
						{{ t("channels.playing") }}
					</p>
				</div>

				<div class="channel-actions">
					<button
						type="button"
						class="btn channel-button"
						:class="
							playback.isPlaying(channel.id) ? 'btn-danger' : 'btn-success'
						"
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
				</div>
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
</script>

<style scoped>
.channels {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	gap: 1rem;
}
.channel {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.25rem;
	border: 1px solid var(--sm-border);
	border-radius: 0.9rem;
	background: var(--sm-surface);
	min-height: 7.5rem;
}
.channel-body {
	min-width: 0;
}
.channel-name {
	margin: 0;
	font-size: 1.25rem;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.channel-state {
	margin: 0.35rem 0 0;
	font-size: 0.85rem;
	display: flex;
	align-items: center;
	gap: 0.35rem;
}
.channel-state-warn {
	color: var(--bs-danger-text-emphasis, var(--bs-danger));
}
.channel-state-live {
	color: var(--bs-success-text-emphasis, var(--bs-success));
	font-weight: 600;
}
.channel-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-shrink: 0;
}
/* Deliberately large: this is the one control an operator uses. */
.channel-button {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	min-width: 6rem;
	min-height: 3rem;
	font-size: 1.05rem;
}
.channel-offline {
	opacity: 0.55;
}
.channel-playing {
	border-color: var(--bs-success);
	box-shadow: 0 0 0 2px rgba(var(--bs-success-rgb), 0.25);
}
.channel-draggable {
	cursor: grab;
	border-style: dashed;
}
.channel-draggable:active {
	cursor: grabbing;
}
.channels-empty {
	max-width: 32rem;
	margin: 4rem auto;
	text-align: center;
}
.channels-empty-icon {
	font-size: 2.5rem;
	opacity: 0.4;
}
.channels-empty-text {
	margin: 1rem 0 0.25rem;
	font-size: 1.2rem;
	font-weight: 500;
}
.channels-empty-hint {
	margin: 0;
	color: var(--sm-muted);
}
@media (max-width: 480px) {
	.channel-button-label {
		display: none;
	}
	.channel-button {
		min-width: 3.5rem;
	}
}
</style>
