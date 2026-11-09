<template>
	<div v-if="!stream" class="alert alert-secondary">
		{{ t("streams.empty") }}
	</div>

	<div v-else class="row g-4">
		<div class="col-12 col-lg-4">
			<div class="mb-3">
				<label class="form-label" for="display-name">
					{{ t("stream.displayName") }}
				</label>
				<input
					id="display-name"
					v-model="displayName"
					type="text"
					class="form-control"
					:placeholder="t('stream.displayNamePlaceholder')"
				/>
				<div class="form-text">{{ t("stream.displayNameHint") }}</div>
			</div>

			<dl class="detail-list">
				<dt>{{ t("stream.id") }}</dt>
				<dd>{{ stream.id }}</dd>

				<dt>{{ t("stream.address") }}</dt>
				<dd>{{ stream.origin?.address || "–" }}</dd>

				<template v-if="clockSource">
					<dt>{{ t("stream.clockSource") }}</dt>
					<dd>{{ clockSource }}</dd>
				</template>

				<template v-if="tags.length">
					<dt>{{ t("stream.tags") }}</dt>
					<dd>
						<span
							v-for="tag in tags"
							:key="tag.key"
							class="badge me-1"
							:class="tag.class"
						>
							{{ t(tag.key) }}
						</span>
					</dd>
				</template>

				<template v-if="effectiveBuffer">
					<dt>{{ t("settings.audio.stability") }}</dt>
					<dd>
						{{ t("stream.effectiveBuffer", { count: effectiveBuffer }) }}
					</dd>
				</template>
			</dl>
		</div>

		<div class="col-12 col-lg-4">
			<div
				v-for="(media, index) in stream.media || []"
				:key="index"
				class="mb-4"
			>
				<h2 class="h6">
					{{ t("stream.media") }}
					<span v-if="(stream.media || []).length > 1">#{{ index + 1 }}</span>
				</h2>
				<dl class="detail-list">
					<dt>{{ t("stream.protocol") }}</dt>
					<dd>{{ media.protocol }} · {{ media.payloads }}</dd>

					<dt>{{ t("stream.address") }}</dt>
					<dd>
						{{ media.connection?.ip?.split("/")[0] || stream.mcast }}:{{
							media.port
						}}
					</dd>

					<template v-if="media.sourceFilter?.srcList">
						<dt>{{ t("stream.sourceFilter") }}</dt>
						<dd>{{ media.sourceFilter.srcList }}</dd>
					</template>

					<template v-if="media.rtp?.[0]">
						<dt>{{ t("stream.format") }}</dt>
						<dd>
							{{
								t("stream.channels", {
									count: media.rtp[0].encoding,
									rate: media.rtp[0].rate,
								})
							}}
						</dd>

						<dt>{{ t("stream.codec") }}</dt>
						<dd>{{ codecLabel(media.rtp[0].codec) }}</dd>
					</template>

					<template v-if="media.ptime">
						<dt>{{ t("stream.packetTime") }}</dt>
						<dd>{{ media.ptime }} ms</dd>
					</template>

					<template v-if="media.description">
						<dt>{{ t("stream.description") }}</dt>
						<dd>{{ media.description }}</dd>
					</template>
				</dl>
			</div>
		</div>

		<div class="col-12 col-lg-4">
			<div class="d-flex align-items-center gap-2 mb-2">
				<h2 class="h6 mb-0 flex-grow-1">{{ t("stream.rawSdp") }}</h2>
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					@click="copy"
				>
					<i class="bi bi-clipboard"></i>
					{{ copied ? t("stream.copied") : t("stream.copySdp") }}
				</button>
				<button
					v-if="stream.manual"
					type="button"
					class="btn btn-sm btn-outline-danger"
					:title="t('stream.delete')"
					@click="remove"
				>
					<i class="bi bi-trash"></i>
				</button>
			</div>
			<!-- Read only on purpose. v-model here used to write back into the
			live stream object, and an inline onclick handler would be blocked
			by the packaged app's CSP. -->
			<textarea
				class="form-control sdp-text"
				:rows="rawRows"
				:value="stream.raw || ''"
				readonly
				@click="selectAll"
			></textarea>
		</div>
	</div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { usePlaybackStore } from "../stores/playback";
import { effectiveBufferSize } from "../config/presets";
import { bridge } from "../ipc/bridge";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const playback = usePlaybackStore();

// Looked up by id every time, so the page follows the live stream instead of
// a copy captured when it was opened.
const stream = computed(() => discovery.streamById(session.selectedStreamId));

const displayName = ref(config.nameOf(session.selectedStreamId));
watch(
	() => session.selectedStreamId,
	(id) => {
		displayName.value = config.nameOf(id);
	},
);
watch(displayName, (value) => {
	config.setName(session.selectedStreamId, value);
});

const clockSource = computed(() => {
	const clocks =
		stream.value?.media?.[0]?.tsRefClocks || stream.value?.tsRefClocks;
	const ext = clocks?.[0]?.clksrcExt;
	return ext ? String(ext).toUpperCase() : "";
});

const tags = computed(() => {
	const current = stream.value;
	if (!current) return [];
	return [
		current.dante && {
			key: "streams.tags.dante",
			class: "text-bg-primary",
		},
		current.groups?.[0]?.type === "DUP" && {
			key: "streams.tags.redundant",
			class: "text-bg-primary",
		},
		current.manual && {
			key: "streams.tags.manual",
			class: "text-bg-secondary",
		},
		current.announce && {
			key: "streams.tags.sap",
			class: "text-bg-secondary",
		},
	].filter(Boolean);
});

// The worker raises the jitter buffer for very short packet times, so show
// what is actually in effect rather than only what was configured.
const effectiveBuffer = computed(() =>
	effectiveBufferSize(config.settings, stream.value),
);

const rawRows = computed(() => {
	const raw = stream.value?.raw;
	if (!raw) return 4;
	return Math.min(
		30,
		raw.split("\n").filter((line) => line.trim() !== "").length,
	);
});

const codecLabel = (codec) => {
	if (codec === "L24") return t("stream.pcm24");
	if (codec === "L16") return t("stream.pcm16");
	return codec;
};

const copied = ref(false);
const copy = async () => {
	try {
		await navigator.clipboard.writeText(stream.value?.raw || "");
		copied.value = true;
		setTimeout(() => {
			copied.value = false;
		}, 2000);
	} catch (error) {
		console.error("Could not copy SDP", error);
	}
};

const selectAll = (event) => event.target.select();

const remove = () => {
	const id = session.selectedStreamId;
	if (playback.isPlaying(id)) playback.stop();
	bridge.send({ type: "delete", data: id });
	session.setPage("streams");
};
</script>

<style scoped>
.detail-list {
	display: grid;
	grid-template-columns: minmax(7rem, auto) 1fr;
	gap: 0.15rem 0.75rem;
	margin: 0;
}
.detail-list dt {
	font-weight: 600;
}
.detail-list dd {
	margin: 0;
	overflow-wrap: anywhere;
}
.sdp-text {
	font-family: var(--bs-font-monospace);
	font-size: 0.8rem;
}
</style>
