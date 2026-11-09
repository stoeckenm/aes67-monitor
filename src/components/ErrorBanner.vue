<template>
	<!-- Failures used to go to console.error only, where nobody sees them. -->
	<div
		v-if="session.lastError"
		class="alert alert-warning d-flex align-items-start gap-2"
		role="status"
	>
		<i class="bi bi-exclamation-triangle-fill mt-1"></i>
		<div class="flex-grow-1">
			<strong>{{ t("errors.title") }}</strong>
			<div>{{ message }}</div>
		</div>
		<button
			type="button"
			class="btn-close"
			:aria-label="t('errors.dismiss')"
			@click="session.dismissError()"
		></button>
	</div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSessionStore } from "../stores/session";

const { t, te } = useI18n();
const session = useSessionStore();

// Main sends a stable code plus a technical message. Prefer the translated
// code and fall back to the raw text for anything not yet catalogued.
const message = computed(() => {
	const error = session.lastError;
	if (!error) return "";
	const key = `errors.${error.code}`;
	if (error.code && te(key)) return t(key);
	return error.message || "";
});
</script>
