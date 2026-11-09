<template>
	<div class="row">
		<div class="col-12 col-lg-8">
			<label class="form-label" for="raw-sdp">{{ t("sdp.hint") }}</label>
			<textarea
				id="raw-sdp"
				v-model="raw"
				class="form-control sdp-input"
				rows="20"
				:placeholder="placeholder"
			></textarea>

			<div class="form-check mt-3">
				<input
					id="announce-sdp"
					v-model="announce"
					class="form-check-input"
					type="checkbox"
				/>
				<label class="form-check-label" for="announce-sdp">
					{{ t("sdp.announce") }}
				</label>
			</div>

			<p v-if="error" class="text-danger mt-2" role="alert">
				{{ t("sdp.invalid") }}
			</p>

			<button
				type="button"
				class="btn btn-primary mt-3"
				:disabled="raw.trim() === ''"
				@click="save"
			>
				{{ t("sdp.save") }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { bridge } from "../ipc/bridge";

const { t } = useI18n();
const session = useSessionStore();

const raw = ref("");
const announce = ref(false);
const error = ref(false);

const placeholder = [
	"v=0",
	"o=- 784066 784066 IN IP4 10.0.100.20",
	"s=Stream",
	"c=IN IP4 239.69.138.112/32",
	"t=0 0",
	"m=audio 5004 RTP/AVP 97",
	"a=recvonly",
	"a=rtpmap:97 L24/48000/2",
	"a=ptime:1",
].join("\n");

const save = () => {
	// The worker rejects anything without an origin and a session name, so
	// check the bare minimum here to give immediate feedback.
	const text = raw.value.trim();
	if (!/^o=/m.test(text) || !/^s=/m.test(text)) {
		error.value = true;
		return;
	}
	error.value = false;
	bridge.send({
		type: "addStream",
		data: { sdp: text + "\n", announce: announce.value },
	});
	raw.value = "";
	announce.value = false;
	session.setPage("streams");
};
</script>

<style scoped>
.sdp-input {
	font-family: var(--bs-font-monospace);
	font-size: 0.85rem;
}
</style>
