<template>
	<div class="operator">
		<header class="operator-bar">
			<h1 class="operator-title">{{ t("channels.title") }}</h1>
			<AdminLock />
		</header>

		<main class="operator-main">
			<ErrorBanner />
			<ChannelsView />
		</main>
	</div>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import AdminLock from "../components/AdminLock.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import ChannelsView from "../views/ChannelsView.vue";

const { t } = useI18n();
</script>

<style scoped>
.operator {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}
.operator-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 1.25rem;
	border-bottom: 1px solid var(--sm-border);
}
.operator-title {
	font-size: 1.35rem;
	font-weight: 600;
	margin: 0;
}
.operator-main {
	flex: 1;
	padding: 1.25rem;
}
</style>
