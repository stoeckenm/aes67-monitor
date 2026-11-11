<template>
	<div class="admin" :class="{ 'admin-collapsed': collapsed }">
		<nav class="admin-nav" :aria-label="t('nav.overview')">
			<button
				class="admin-brand"
				type="button"
				:title="t('app.name')"
				@click="config.setSidebarCollapsed(!collapsed)"
			>
				<i class="bi bi-soundwave"></i>
				<span class="admin-brand-text">{{ t("app.name") }}</span>
			</button>

			<ul class="admin-menu">
				<li v-for="item in menu" :key="item.page">
					<button
						type="button"
						class="admin-menu-item"
						:class="{ active: session.page === item.page }"
						:aria-current="session.page === item.page ? 'page' : undefined"
						@click="session.setPage(item.page)"
					>
						<i class="bi" :class="item.icon"></i>
						<span class="admin-menu-text">{{ t(item.label) }}</span>
						<span v-if="item.badge !== undefined" class="badge bg-primary">
							{{ item.badge }}
						</span>
					</button>
				</li>
			</ul>

			<div class="admin-lock">
				<AdminLock />
			</div>
		</nav>

		<header class="admin-header">
			<button
				v-if="session.canGoBack"
				type="button"
				class="btn btn-sm btn-outline-secondary me-2"
				@click="session.goBack()"
			>
				<i class="bi bi-caret-left"></i> {{ t("common.back") }}
			</button>
			<h1 class="admin-title">{{ title }}</h1>

			<div class="admin-header-actions">
				<input
					v-if="session.searchable"
					id="search-input"
					v-model="session.search"
					type="search"
					class="form-control form-control-sm admin-search"
					:placeholder="t('streams.search')"
					:aria-label="t('streams.search')"
				/>
				<button
					v-if="session.page === 'streams'"
					type="button"
					class="btn btn-sm btn-primary"
					:title="t('streams.addManual')"
					:aria-label="t('streams.addManual')"
					@click="session.setPage('sdp')"
				>
					<i class="bi bi-plus-lg"></i>
				</button>
			</div>
		</header>

		<main class="admin-main">
			<ErrorBanner />
			<component :is="view" />
		</main>
	</div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AdminLock from "../components/AdminLock.vue";
import ErrorBanner from "../components/ErrorBanner.vue";
import OverviewView from "../views/OverviewView.vue";
import ChannelsAdminView from "../views/ChannelsAdminView.vue";
import StreamsView from "../views/StreamsView.vue";
import StreamDetailView from "../views/StreamDetailView.vue";
import SendersView from "../views/SendersView.vue";
import AudioDevicesView from "../views/AudioDevicesView.vue";
import SettingsView from "../views/SettingsView.vue";
import AddStreamView from "../views/AddStreamView.vue";
import { useSessionStore } from "../stores/session";
import { useConfigStore } from "../stores/config";
import { useDiscoveryStore } from "../stores/discovery";
import { useChannelsStore } from "../stores/channels";

const { t } = useI18n();
const session = useSessionStore();
const config = useConfigStore();
const discovery = useDiscoveryStore();
const channels = useChannelsStore();

const collapsed = computed(() => config.user.settings.sidebarCollapsed);

// Every badge means the same thing: how many rows that page will show. The
// Streams badge used to be the unfiltered total while the page showed the
// filtered list, so the two contradicted each other whenever a filter was on.
const menu = computed(() => [
	{ page: "overview", label: "nav.overview", icon: "bi-speedometer2" },
	{
		page: "channels",
		label: "nav.channels",
		icon: "bi-star-fill",
		badge: channels.count,
	},
	{
		page: "streams",
		label: "nav.streams",
		icon: "bi-speaker",
		badge: discovery.visibleCount,
	},
	{
		page: "senders",
		label: "nav.senders",
		icon: "bi-hdd-network",
		badge: discovery.senders.length,
	},
	{ page: "audio", label: "nav.audio", icon: "bi-volume-up" },
	{ page: "settings", label: "nav.settings", icon: "bi-gear" },
]);

const views = {
	overview: OverviewView,
	channels: ChannelsAdminView,
	streams: StreamsView,
	stream: StreamDetailView,
	senders: SendersView,
	audio: AudioDevicesView,
	settings: SettingsView,
	sdp: AddStreamView,
};

const view = computed(() => views[session.page] || OverviewView);

const titles = {
	overview: "overview.title",
	channels: "channels.admin.title",
	streams: "streams.title",
	senders: "senders.title",
	audio: "audio.title",
	settings: "settings.title",
	sdp: "sdp.title",
};

const title = computed(() => {
	if (session.page === "stream") {
		// Interpolated by Vue, never v-html: this is a name straight off the
		// network.
		return discovery.displayName(
			discovery.streamById(session.selectedStreamId),
		);
	}
	return t(titles[session.page] || "overview.title");
});
</script>

<style scoped>
.admin {
	--nav-width: 240px;
	--header-height: 60px;
	min-height: 100vh;
}
.admin-collapsed {
	--nav-width: 64px;
}
.admin-nav {
	position: fixed;
	top: 0;
	left: 0;
	width: var(--nav-width);
	height: 100vh;
	display: flex;
	flex-direction: column;
	border-right: 1px solid var(--sm-border);
	background: var(--sm-surface);
	transition: width 0.2s ease;
	overflow: hidden;
}
.admin-brand {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	height: var(--header-height);
	padding: 0 1rem;
	border: 0;
	border-bottom: 1px solid var(--sm-border);
	background: none;
	color: inherit;
	font-size: 1.1rem;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
}
.admin-menu {
	list-style: none;
	margin: 0.75rem 0 0;
	padding: 0;
}
.admin-menu-item {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	width: 100%;
	padding: 0.65rem 1rem;
	border: 0;
	border-left: 3px solid transparent;
	background: none;
	color: inherit;
	font-size: 1rem;
	text-align: left;
	white-space: nowrap;
	cursor: pointer;
}
.admin-menu-item:hover {
	background: var(--sm-surface-hover);
}
.admin-menu-item.active {
	border-left-color: var(--bs-primary);
	color: var(--bs-primary);
	font-weight: 600;
}
.admin-menu-item .badge {
	margin-left: auto;
}
.admin-collapsed .admin-brand-text,
.admin-collapsed .admin-menu-text,
.admin-collapsed .admin-menu-item .badge {
	display: none;
}
.admin-lock {
	margin-top: auto;
	padding: 0.75rem;
	border-top: 1px solid var(--sm-border);
}
.admin-header {
	position: fixed;
	top: 0;
	left: var(--nav-width);
	right: 0;
	height: var(--header-height);
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0 1.25rem;
	border-bottom: 1px solid var(--sm-border);
	background: var(--sm-surface);
	transition: left 0.2s ease;
}
.admin-title {
	font-size: 1.15rem;
	font-weight: 500;
	margin: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.admin-header-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-left: auto;
}
.admin-search {
	width: 16rem;
}
.admin-main {
	padding: calc(var(--header-height) + 1.25rem) 1.25rem 1.25rem
		calc(var(--nav-width) + 1.25rem);
	transition: padding-left 0.2s ease;
}
@media (max-width: 720px) {
	.admin-search {
		width: 9rem;
	}
}
</style>
