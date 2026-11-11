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
	--nav-width: 244px;
	--header-height: 62px;
	min-height: 100vh;
	background: var(--sm-bg);
}
.admin-collapsed {
	--nav-width: 68px;
}

/* ------------------------------------------------------------------ sidebar */
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
	z-index: 20;
}
.admin-brand {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	height: var(--header-height);
	padding: 0 1.1rem;
	border: 0;
	background: none;
	color: inherit;
	font-size: 1.05rem;
	font-weight: 600;
	letter-spacing: -0.015em;
	white-space: nowrap;
	cursor: pointer;
}
.admin-brand .bi {
	font-size: 1.4rem;
	color: var(--sm-accent);
	line-height: 1;
}
.admin-menu {
	list-style: none;
	margin: 0.5rem 0 0;
	padding: 0 0.55rem;
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}
/* A pill that fills on hover and carries the accent when active, instead of a
   left border bar. */
.admin-menu-item {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	width: 100%;
	padding: 0.55rem 0.7rem;
	border: 0;
	border-radius: var(--sm-radius-sm);
	background: none;
	color: var(--sm-muted);
	font-size: 0.97rem;
	font-weight: 500;
	text-align: left;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s ease,
		color 0.14s ease;
}
.admin-menu-item .bi {
	font-size: 1.05rem;
	line-height: 1;
	flex-shrink: 0;
}
.admin-menu-item:hover {
	background: var(--sm-surface-hover);
	color: var(--bs-body-color);
}
.admin-menu-item.active {
	background: var(--sm-accent-soft);
	color: var(--sm-accent);
	font-weight: 600;
}
/* A plain counter, not a shouting pill: these are informational. */
.admin-menu-item .badge {
	margin-left: auto;
	background: var(--sm-surface-2) !important;
	color: var(--sm-muted);
	font-size: 0.72rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}
.admin-menu-item.active .badge {
	background: var(--sm-accent) !important;
	color: #fff;
}
.admin-collapsed .admin-brand-text,
.admin-collapsed .admin-menu-text,
.admin-collapsed .admin-menu-item .badge {
	display: none;
}
.admin-collapsed .admin-menu-item {
	justify-content: center;
	padding-inline: 0;
}
.admin-lock {
	margin-top: auto;
	padding: 0.85rem;
	border-top: 1px solid var(--sm-border);
}

/* ------------------------------------------------------------------- header */
.admin-header {
	position: fixed;
	top: 0;
	left: var(--nav-width);
	right: 0;
	height: var(--header-height);
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0 1.5rem;
	border-bottom: 1px solid var(--sm-border);
	background: var(--sm-surface);
	box-shadow: var(--sm-shadow-sm);
	transition: left 0.2s ease;
	z-index: 10;
}
.admin-title {
	font-size: 1.2rem;
	font-weight: 600;
	letter-spacing: -0.015em;
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
	width: 17rem;
}

/* --------------------------------------------------------------------- main */
.admin-main {
	padding: calc(var(--header-height) + 1.5rem) 1.5rem 2.5rem
		calc(var(--nav-width) + 1.5rem);
	transition: padding-left 0.2s ease;
}

@media (max-width: 720px) {
	.admin-search {
		width: 9rem;
	}
	.admin-main {
		padding-right: 1rem;
		padding-left: calc(var(--nav-width) + 1rem);
	}
}
</style>
