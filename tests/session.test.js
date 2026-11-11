import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSessionStore } from "../src/stores/session.js";

let session;

beforeEach(() => {
	setActivePinia(createPinia());
	session = useSessionStore();
});

describe("navigation", () => {
	it("starts on the overview and remembers where it came from", () => {
		expect(session.page).toBe("overview");
		session.setPage("streams");
		expect(session.previousPage).toBe("overview");
	});

	it("ignores a move to the page already open", () => {
		session.setPage("streams");
		session.setPage("streams");
		expect(session.previousPage).toBe("overview");
	});

	it("goes back where it came from rather than to a fixed page", () => {
		session.setPage("channels");
		session.openStream("abc");
		expect(session.page).toBe("stream");
		session.goBack();
		expect(session.page).toBe("channels");
	});

	it("falls back to the streams page when nothing was visited before", () => {
		session.goBack();
		expect(session.page).toBe("streams");
	});

	it("knows which pages own a search box and which can go back", () => {
		session.setPage("streams");
		expect(session.searchable).toBe(true);
		expect(session.canGoBack).toBe(false);
		session.setPage("senders");
		expect(session.searchable).toBe(true);
		session.setPage("settings");
		expect(session.searchable).toBe(false);
		session.openStream("abc");
		expect(session.canGoBack).toBe(true);
	});
});

describe("the search term's lifetime", () => {
	// A term that survived a page change left a filter active that nothing on
	// screen explained.
	it("is dropped when moving between list pages", () => {
		session.setPage("streams");
		session.search = "regie";
		session.setPage("senders");
		expect(session.search).toBe("");
	});

	it("is dropped when leaving for a page without a search box", () => {
		session.setPage("streams");
		session.search = "regie";
		session.setPage("settings");
		expect(session.search).toBe("");
	});

	// Losing it on every Details click would make the table unusable.
	it("survives stepping into a detail page and back", () => {
		session.setPage("streams");
		session.search = "regie";
		session.openStream("abc");
		expect(session.search).toBe("regie");
		session.goBack();
		expect(session.search).toBe("regie");
	});
});

describe("the sender filter", () => {
	it("is its own state, not a pre-filled search term", () => {
		session.showSenderStreams("10.0.0.5");
		expect(session.page).toBe("streams");
		expect(session.senderFilter).toBe("10.0.0.5");
		expect(session.search).toBe("");
	});

	it("can be cleared on its own", () => {
		session.showSenderStreams("10.0.0.5");
		session.clearSenderFilter();
		expect(session.senderFilter).toBe("");
		expect(session.page).toBe("streams");
	});

	it("is dropped together with the search when leaving the page", () => {
		session.showSenderStreams("10.0.0.5");
		session.setPage("settings");
		expect(session.senderFilter).toBe("");
	});

	it("survives a trip to the detail page", () => {
		session.showSenderStreams("10.0.0.5");
		session.openStream("abc");
		session.goBack();
		expect(session.senderFilter).toBe("10.0.0.5");
	});
});

describe("locking", () => {
	// A kiosk machine has to come back up locked and on a clean page.
	it("clears every trace of the admin session", () => {
		session.unlock();
		session.showSenderStreams("10.0.0.5");
		session.search = "regie";
		session.openStream("abc");

		session.lock();

		expect(session.adminMode).toBe(false);
		expect(session.page).toBe("overview");
		expect(session.previousPage).toBe("");
		expect(session.search).toBe("");
		expect(session.senderFilter).toBe("");
		expect(session.selectedStreamId).toBeNull();
	});
});
