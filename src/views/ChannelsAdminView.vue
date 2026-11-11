<template>
	<p class="text-muted channels-admin-intro">{{ t("channels.admin.intro") }}</p>

	<div class="btn-group btn-group-sm mb-3" role="group">
		<button
			type="button"
			class="btn"
			:class="mode === 'list' ? 'btn-primary' : 'btn-outline-primary'"
			@click="mode = 'list'"
		>
			<i class="bi bi-list-ul"></i> {{ t("channels.admin.list") }}
		</button>
		<button
			type="button"
			class="btn"
			:class="mode === 'preview' ? 'btn-primary' : 'btn-outline-primary'"
			@click="mode = 'preview'"
		>
			<i class="bi bi-eye"></i> {{ t("channels.admin.preview") }}
		</button>
	</div>

	<template v-if="mode === 'preview'">
		<p class="text-muted">{{ t("channels.admin.previewHint") }}</p>
		<ChannelsView editable />
	</template>

	<div v-else-if="channels.resolved.length === 0" class="alert alert-secondary">
		{{ t("channels.admin.empty") }} {{ t("channels.admin.emptyHint") }}
	</div>

	<div v-else class="table-responsive">
		<table class="table table-sm align-middle">
			<thead>
				<tr>
					<th scope="col" class="col-position">
						{{ t("channels.admin.position") }}
					</th>
					<th scope="col">{{ t("channels.admin.name") }}</th>
					<th scope="col">{{ t("channels.admin.source") }}</th>
					<th scope="col">{{ t("channels.admin.sender") }}</th>
					<th scope="col">{{ t("channels.admin.mapping") }}</th>
					<th scope="col">{{ t("channels.admin.state") }}</th>
					<th scope="col" class="text-end"></th>
				</tr>
			</thead>

			<tbody>
				<tr v-for="channel in channels.resolved" :key="channel.id">
					<td class="text-muted">{{ channel.position }}</td>

					<td>
						<!-- The one field the operator actually reads, editable where the
            channel is configured rather than three clicks away on the stream
            detail page. -->
						<input
							type="text"
							class="form-control form-control-sm"
							:value="config.nameOf(channel.id)"
							:placeholder="t('channels.admin.namePlaceholder')"
							:aria-label="t('channels.admin.name')"
							@input="rename(channel, $event.target.value)"
						/>
					</td>

					<td>
						{{ channel.sourceName || "–" }}
					</td>

					<td>{{ channel.sender || "–" }}</td>

					<td>
						<select
							v-if="channel.stream && channel.stream.isSupported"
							v-model="playback.channelByStream[channel.id]"
							class="form-select form-select-sm"
							:disabled="playback.isPlaying(channel.id)"
							:title="
								playback.isPlaying(channel.id)
									? t('stream.lockedWhilePlaying')
									: undefined
							"
							:aria-label="t('channels.admin.mapping')"
						>
							<option
								v-for="option in playback.channelOptions(channel.stream)"
								:key="option.value"
								:value="option.value"
							>
								{{ channelLabel(option) }}
							</option>
						</select>
						<span v-else class="text-muted">–</span>
					</td>

					<td>
						<span v-if="!channel.online" class="badge text-bg-warning">
							{{ t("channels.admin.offline") }}
						</span>
						<span v-else-if="!channel.playable" class="badge text-bg-danger">
							{{ t("channels.admin.notPlayable") }}
						</span>
						<span v-else class="badge text-bg-success">
							{{ t("channels.admin.online") }}
						</span>
					</td>

					<td class="text-end text-nowrap">
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary me-1"
							:disabled="channel.position === 1"
							:title="t('channels.admin.up')"
							:aria-label="t('channels.admin.up')"
							@click="channels.move(channel.id, -1)"
						>
							<i class="bi bi-arrow-up"></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-secondary me-1"
							:disabled="channel.position === channels.count"
							:title="t('channels.admin.down')"
							:aria-label="t('channels.admin.down')"
							@click="channels.move(channel.id, 1)"
						>
							<i class="bi bi-arrow-down"></i>
						</button>
						<button
							v-if="channel.online"
							type="button"
							class="btn btn-sm btn-outline-primary me-1"
							:title="t('channels.admin.details')"
							:aria-label="t('channels.admin.details')"
							@click="session.openStream(channel.id)"
						>
							<i class="bi bi-info-circle"></i>
						</button>
						<button
							type="button"
							class="btn btn-sm btn-outline-danger"
							:title="t('channels.admin.remove')"
							:aria-label="t('channels.admin.remove')"
							@click="remove(channel)"
						>
							<i class="bi bi-trash"></i>
						</button>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>

<script setup>
// The admin's view of the channels: position, the name operators read, which
// stream it points at and which of its channels are used — one channel fully
// configurable in one row. The operator tiles are available as a preview, but
// they deliberately hide all of this.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ChannelsView from "./ChannelsView.vue";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useChannelsStore } from "../stores/channels";
import { usePlaybackStore } from "../stores/playback";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const channels = useChannelsStore();
const playback = usePlaybackStore();

const mode = ref("list");

const rename = (channel, value) => {
	config.setName(channel.id, value);
};

const remove = (channel) => {
	if (playback.isPlaying(channel.id)) playback.stop();
	channels.remove(channel.id);
};

const channelLabel = (option) =>
	option.kind === "stereo"
		? t("streams.channelStereo", { first: option.first, second: option.second })
		: t("streams.channelMono", { channel: option.channel });
</script>

<style scoped>
.channels-admin-intro {
	margin-bottom: 0.75rem;
}
.col-position {
	width: 3rem;
}
</style>
