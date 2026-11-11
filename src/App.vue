<template>
	<!-- Two distinct shells rather than one shell with pieces hidden: the
	operator is meant to see a different application, not a stripped down
	admin tool. -->
	<AdminLayout v-if="session.adminMode" />
	<OperatorLayout v-else />
</template>

<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import AdminLayout from "./layouts/AdminLayout.vue";
import OperatorLayout from "./layouts/OperatorLayout.vue";
import { useSessionStore } from "./stores/session";
import { useConfigStore } from "./stores/config";
import { usePlaybackStore } from "./stores/playback";
import { startReceiver } from "./ipc/receiver";
import { applyTheme, watchSystemScheme } from "./utils/theme";

const session = useSessionStore();
const config = useConfigStore();
const playback = usePlaybackStore();

// main.js applies the OS preference before the first paint so there is no
// flash of the wrong theme. Once the config is loaded, the stored choice takes
// over, and an OS change still re-applies while that choice is "system".
let stopWatchingScheme = null;

onMounted(async () => {
	await config.load();
	config.startWatchers();
	playback.watchDiscovery();
	startReceiver();

	watch(
		() => config.user.settings.theme,
		(choice) => applyTheme(choice),
		{ immediate: true },
	);
	stopWatchingScheme = watchSystemScheme(() =>
		applyTheme(config.user.settings.theme),
	);
});

onUnmounted(() => stopWatchingScheme?.());
</script>
