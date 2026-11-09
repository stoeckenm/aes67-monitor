<template>
	<div class="lock">
		<button
			type="button"
			class="btn btn-sm"
			:class="session.adminMode ? 'btn-danger' : 'btn-outline-secondary'"
			@click="toggle"
		>
			<i
				class="bi"
				:class="session.adminMode ? 'bi-lock-fill' : 'bi-unlock'"
			></i>
			<span class="lock-label">
				{{ session.adminMode ? t("nav.lock") : t("nav.unlock") }}
			</span>
		</button>

		<form v-if="asking" class="lock-form" @submit.prevent="submit">
			<label class="visually-hidden" for="admin-password">
				{{ t("nav.password") }}
			</label>
			<input
				id="admin-password"
				ref="field"
				v-model="password"
				type="password"
				class="form-control form-control-sm"
				:placeholder="t('nav.passwordPlaceholder')"
				:aria-invalid="wrong ? 'true' : undefined"
				autocomplete="current-password"
			/>
			<button type="submit" class="btn btn-sm btn-primary w-100 mt-1">
				{{ t("nav.submit") }}
			</button>
			<p v-if="wrong" class="lock-error" role="alert">
				{{ t("nav.passwordWrong") }}
			</p>
		</form>
	</div>
</template>

<script setup>
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { bridge } from "../ipc/bridge";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();

const asking = ref(false);
const password = ref("");
const wrong = ref(false);
const field = ref(null);

const toggle = async () => {
	if (session.adminMode) {
		session.lock();
		asking.value = false;
		password.value = "";
		wrong.value = false;
		return;
	}
	// Without a configured password the lock opens straight away, which is
	// also what the settings page warns about.
	if (!config.hasPassword) {
		session.unlock();
		return;
	}
	asking.value = true;
	await nextTick();
	field.value?.focus();
};

const submit = async () => {
	// Verified in the main process, which owns the hash
	const result = await bridge.verifyAdminPassword(password.value);
	if (result?.ok) {
		session.unlock();
		asking.value = false;
		password.value = "";
		wrong.value = false;
	} else {
		wrong.value = true;
	}
};
</script>

<style scoped>
.lock-label:not(:empty) {
	margin-left: 0.35rem;
}
.lock-form {
	margin-top: 0.5rem;
	min-width: 11rem;
}
.lock-error {
	margin: 0.35rem 0 0;
	font-size: 0.85rem;
	color: var(--bs-danger);
}
</style>
