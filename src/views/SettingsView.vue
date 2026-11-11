<template>
	<div class="settings">
		<ul class="nav nav-tabs mb-4" role="tablist">
			<li v-for="tab in tabs" :key="tab" class="nav-item" role="presentation">
				<button
					type="button"
					class="nav-link"
					:class="{ active: active === tab }"
					role="tab"
					:aria-selected="active === tab"
					@click="config.setSettingsTab(tab)"
				>
					{{ t(`settings.tabs.${tab}`) }}
				</button>
			</li>
		</ul>

		<!-- PLAYBACK: what comes out of this machine -->
		<section v-if="active === 'playback'" class="settings-panel">
			<fieldset class="settings-group">
				<legend class="settings-legend">
					{{ t("audio.title") }}
				</legend>
				<div class="form-text mb-2">
					{{ t("settings.playback.deviceLink") }}
				</div>
				<button
					type="button"
					class="btn btn-sm btn-outline-secondary"
					@click="session.setPage('audio')"
				>
					{{ t("settings.playback.goDevices") }}
				</button>
			</fieldset>

			<fieldset class="settings-group">
				<legend class="settings-legend">
					{{ t("settings.playback.stability") }}
				</legend>
				<div class="form-text mb-2">
					{{ t("settings.playback.stabilityHint") }}
				</div>

				<select v-model="bufferLevel" class="form-select settings-control">
					<option
						v-for="level in bufferChoices"
						:key="level"
						:value="level"
						:disabled="level === 'custom'"
					>
						{{ t(`settings.playback.levels.${level}`) }}
					</option>
				</select>

				<details class="mt-3" :open="bufferLevel === 'custom'">
					<summary>{{ t("settings.playback.expert") }}</summary>
					<div class="input-group settings-control mt-2">
						<input
							v-model.number="bufferSize"
							type="number"
							min="0"
							max="512"
							class="form-control"
							:disabled="!config.settings.bufferEnabled"
							:aria-label="t('settings.playback.expert')"
						/>
						<span class="input-group-text">
							{{ t("settings.playback.packets") }}
						</span>
					</div>
					<div class="form-text">{{ t("settings.playback.expertHint") }}</div>
				</details>
			</fieldset>
		</section>

		<!-- NETWORK: what this machine listens for -->
		<section v-if="active === 'network'" class="settings-panel">
			<fieldset class="settings-group">
				<legend class="settings-legend">
					{{ t("settings.network.interface") }}
				</legend>
				<div class="form-text mb-2">
					{{ t("settings.network.interfaceHint") }}
				</div>

				<p
					v-if="discovery.networkInterfaces.length === 0"
					class="text-danger-emphasis"
				>
					{{ t("settings.network.noInterface") }}
				</p>
				<select
					v-else
					class="form-select settings-control"
					:value="config.persistent.network.currentInterface"
					:aria-label="t('settings.network.interface')"
					@change="selectInterface($event.target.value)"
				>
					<option
						v-for="item in discovery.networkInterfaces"
						:key="item.address"
						:value="item.address"
					>
						{{ item.name }}: {{ item.address }}
					</option>
				</select>
			</fieldset>

			<fieldset class="settings-group">
				<legend class="settings-legend">
					{{ t("settings.network.timeout") }}
				</legend>
				<div class="form-text mb-2">
					{{ t("settings.network.timeoutHint") }}
				</div>

				<select v-model="timeout" class="form-select settings-control">
					<option
						v-for="choice in timeoutChoices"
						:key="choice"
						:value="choice"
						:disabled="choice === 'custom'"
					>
						{{ t(`settings.network.timeouts.${choice}`) }}
					</option>
				</select>
			</fieldset>
		</section>

		<!-- ACCESS -->
		<section v-if="active === 'access'" class="settings-panel">
			<fieldset class="settings-group">
				<legend class="settings-legend">
					{{ t("settings.access.password") }}
				</legend>

				<p>
					{{
						config.hasPassword
							? t("settings.access.isSet")
							: t("settings.access.isNotSet")
					}}
				</p>

				<div class="input-group settings-control mb-2">
					<input
						v-model="newPassword"
						type="password"
						class="form-control"
						:placeholder="t('settings.access.placeholder')"
						autocomplete="new-password"
						@keyup.enter="setPassword"
					/>
					<button
						type="button"
						class="btn btn-primary"
						:disabled="!newPassword"
						@click="setPassword"
					>
						{{ t("settings.access.set") }}
					</button>
				</div>

				<button
					v-if="config.hasPassword"
					type="button"
					class="btn btn-sm btn-outline-danger"
					@click="removePassword"
				>
					{{ t("settings.access.remove") }}
				</button>

				<p v-if="feedback" class="text-success mt-2" role="status">
					{{ feedback }}
				</p>

				<!-- Said plainly: this is a guard against misuse of the UI, not
        a security boundary. -->
				<p class="form-text mt-3">{{ t("settings.access.disclaimer") }}</p>
			</fieldset>
		</section>
	</div>
</template>

<script setup>
// Grouped by subsystem rather than by technology: "Wiedergabe" is everything
// that affects what comes out of this machine, "Netzwerk" everything that
// affects what it listens for. The jitter buffer and the discovery timeout are
// both time behaviour, but they belong to different subsystems, which the old
// "Audio"/"Netzwerk" split left unexplained.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { bridge } from "../ipc/bridge";
import {
	bufferLevelOf,
	applyBufferLevel,
	timeoutKeyOf,
	applyTimeoutKey,
} from "../config/presets";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();

const tabs = ["playback", "network", "access"];
// Persisted, so the page does not forget which tab was open on every
// navigation away and back.
const active = computed(() => {
	const stored = config.user.settings.settingsTab;
	return tabs.includes(stored) ? stored : "playback";
});

// Named levels on top of the stored bufferEnabled/bufferSize pair, so the
// stored shape is unchanged and an exact value is still possible.
const bufferChoices = ["off", "low", "standard", "stable", "custom"];
const bufferLevel = computed({
	get: () => bufferLevelOf(config.settings),
	set: (key) => applyBufferLevel(config.settings, key),
});

const bufferSize = computed({
	get: () => config.settings.bufferSize,
	set: (value) => {
		const size = Number(value);
		if (!Number.isFinite(size) || size < 0) return;
		config.settings.bufferSize = Math.min(512, Math.round(size));
	},
});

const timeoutChoices = ["short", "default", "never", "custom"];
const timeout = computed({
	get: () => timeoutKeyOf(config.settings),
	set: (key) => applyTimeoutKey(config.settings, key),
});

// Persisting the selection alone leaves the discovery worker on the old
// adapter until restart, so it has to be announced.
const selectInterface = (address) => {
	if (!address) return;
	config.persistent.network.currentInterface = address;
	bridge.send({ type: "setNetwork", data: address });
};

const newPassword = ref("");
const feedback = ref("");

const flash = (text) => {
	feedback.value = text;
	setTimeout(() => {
		feedback.value = "";
	}, 3000);
};

// Hashing happens in the main process, which owns the hash. Setting and
// removing are separate actions, so an empty field can no longer clear it by
// accident.
const setPassword = async () => {
	if (!newPassword.value) return;
	await bridge.setAdminPassword(newPassword.value);
	newPassword.value = "";
	flash(t("settings.access.saved"));
};

const removePassword = async () => {
	await bridge.setAdminPassword(null);
	newPassword.value = "";
	flash(t("settings.access.removed"));
};
</script>

<style scoped>
.settings {
	max-width: 46rem;
}
.settings-group {
	margin-bottom: 2.25rem;
	border: 0;
	padding: 0;
}
.settings-legend {
	font-size: 1.05rem;
	font-weight: 600;
	margin-bottom: 0.5rem;
}
.settings-control {
	max-width: 24rem;
}
.device-list {
	list-style: none;
	margin: 0;
	padding: 0;
}
.device-option {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.45rem 0;
	cursor: pointer;
}
.device-name {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
summary {
	cursor: pointer;
	font-weight: 500;
}
</style>
