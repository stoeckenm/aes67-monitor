<template>
	<div class="operator">
		<header class="operator-bar">
			<div class="operator-brand">
				<i class="bi bi-soundwave operator-mark"></i>
				<h1 class="operator-title">{{ t("channels.title") }}</h1>
			</div>
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
	background: var(--sm-bg);
}
.operator-bar {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.9rem 1.5rem;
	background: var(--sm-surface);
	border-bottom: 1px solid var(--sm-border);
	box-shadow: var(--sm-shadow-sm);
}
.operator-brand {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	min-width: 0;
}
.operator-mark {
	font-size: 1.5rem;
	color: var(--sm-accent);
	line-height: 1;
}
.operator-title {
	font-size: 1.4rem;
	font-weight: 600;
	letter-spacing: -0.015em;
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.operator-main {
	flex: 1;
	width: 100%;
	max-width: 88rem;
	margin: 0 auto;
	padding: 1.75rem 1.5rem 2.5rem;
}
@media (max-width: 520px) {
	.operator-bar {
		padding: 0.75rem 1rem;
	}
	.operator-main {
		padding: 1.25rem 1rem 2rem;
	}
}
</style>
