// stores/session.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";

// Pages that own the header search box, and the detail pages reached from them.
// Leaving a list page drops its search term, but stepping into a detail page
// and back keeps it: a term that survives a page change leaves a filter active
// that nothing on screen explains, while losing it on every Details click
// makes the table unusable.
const LIST_PAGES = ["streams", "senders"];
const DETAIL_PAGES = ["stream", "sdp"];

export const useSessionStore = defineStore("session", () => {
	// Deliberately not persisted: a kiosk machine has to come back up locked.
	const adminMode = ref(false);
	const page = ref("overview");
	const previousPage = ref("");
	const search = ref("");
	// "Show the streams of this sender" is its own state, not a pre-filled
	// search box. As a search term it was indistinguishable from something the
	// user had typed, and the Streams page could not label where it came from.
	const senderFilter = ref("");
	const lastError = ref(null);
	// The open stream is tracked by id, not by object reference: discovery
	// replaces stream objects, and holding one meant the detail page could
	// show a stale copy.
	const selectedStreamId = ref(null);

	// The operator view is its own layout, not a subset of the admin one
	const isOperator = computed(() => !adminMode.value);
	const searchable = computed(() => LIST_PAGES.includes(page.value));
	const canGoBack = computed(() => DETAIL_PAGES.includes(page.value));

	const keepsSearch = (from, to) =>
		DETAIL_PAGES.includes(to) ||
		(DETAIL_PAGES.includes(from) && LIST_PAGES.includes(to));

	const setPage = (next) => {
		if (!next || next === page.value) return;
		if (!keepsSearch(page.value, next)) {
			search.value = "";
			senderFilter.value = "";
		}
		previousPage.value = page.value;
		page.value = next;
	};

	const openStream = (id) => {
		selectedStreamId.value = id;
		setPage("stream");
	};

	// Back goes where the user came from, not to a hardcoded page
	const goBack = () => {
		setPage(previousPage.value || "streams");
	};

	const showSenderStreams = (address) => {
		setPage("streams");
		senderFilter.value = address || "";
	};

	const clearSenderFilter = () => {
		senderFilter.value = "";
	};

	const lock = () => {
		adminMode.value = false;
		page.value = "overview";
		previousPage.value = "";
		search.value = "";
		senderFilter.value = "";
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
		previousPage,
		search,
		senderFilter,
		lastError,
		selectedStreamId,
		isOperator,
		searchable,
		canGoBack,
		setPage,
		openStream,
		goBack,
		showSenderStreams,
		clearSenderFilter,
		lock,
		unlock,
		reportError,
		dismissError,
	};
});
