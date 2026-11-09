// stores/session.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSessionStore = defineStore("session", () => {
	// Deliberately not persisted: a kiosk machine has to come back up locked.
	const adminMode = ref(false);
	const page = ref("favorites");
	const search = ref("");
	const lastError = ref(null);
	// The open stream is tracked by id, not by object reference: discovery
	// replaces stream objects, and holding one meant the detail page could
	// show a stale copy.
	const selectedStreamId = ref(null);

	// The operator view is its own layout, not a subset of the admin one
	const isOperator = computed(() => !adminMode.value);

	const setPage = (next) => {
		page.value = next;
	};

	const openStream = (id) => {
		selectedStreamId.value = id;
		page.value = "stream";
	};

	const lock = () => {
		adminMode.value = false;
		page.value = "favorites";
		search.value = "";
		selectedStreamId.value = null;
	};

	const unlock = () => {
		adminMode.value = true;
	};

	const reportError = (error) => {
		lastError.value = error;
	};

	const dismissError = () => {
		lastError.value = null;
	};

	return {
		adminMode,
		page,
		search,
		lastError,
		selectedStreamId,
		isOperator,
		setPage,
		openStream,
		lock,
		unlock,
		reportError,
		dismissError,
	};
});
