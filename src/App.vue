<template>
	<!-- Two distinct shells rather than one shell with pieces hidden: the
	operator is meant to see a different application, not a stripped down
	admin tool. -->
	<AdminLayout v-if="session.adminMode" />
	<OperatorLayout v-else />
</template>

<script setup>
import { onMounted } from "vue";
import AdminLayout from "./layouts/AdminLayout.vue";
import OperatorLayout from "./layouts/OperatorLayout.vue";
import { useSessionStore } from "./stores/session";
import { useConfigStore } from "./stores/config";
import { usePlaybackStore } from "./stores/playback";
import { startReceiver } from "./ipc/receiver";

const session = useSessionStore();
const config = useConfigStore();
const playback = usePlaybackStore();

onMounted(async () => {
	await config.load();
	config.startWatchers();
	playback.watchDiscovery();
	startReceiver();
});
</script>
