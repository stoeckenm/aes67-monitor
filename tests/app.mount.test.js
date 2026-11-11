// @vitest-environment jsdom
//
// Mounting the real shells catches setup() errors and broken imports that a
// successful bundle alone would not surface.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { i18n } from "../src/i18n/index.js";
import App from "../src/App.vue";
import { useSessionStore } from "../src/stores/session.js";
import { useDiscoveryStore } from "../src/stores/discovery.js";

const sent = [];

const sharedConfig = (overrides = {}) => ({
	persistentData: {
		settings: {
			bufferSize: 16,
			bufferEnabled: true,
			hideUnsupported: true,
			sdpDeleteTimeout: 300,
			followSystemAudio: true,
			audioInterface: null,
			storedAudioInterface: null,
		},
		network: { interfaces: [], currentInterface: "" },
		devices: {},
		favorites: [],
		manualStreams: [],
		streamNames: {},
		hasPassword: false,
		...overrides,
	},
	userData: {
		settings: {
			sidebarCollapsed: false,
			window: { width: 1280, height: 800, x: null, y: null, maximized: true },
			favoritesOrder: [],
			settingsTab: "playback",
		},
	},
});

let pinia;

beforeEach(() => {
	sent.length = 0;
	pinia = createPinia();
	setActivePinia(pinia);
	window.electronAPI = {
		recvMessage: vi.fn(),
		sendMessage: vi.fn((m) => sent.push(m)),
		getSharedConfig: vi.fn(async () => sharedConfig()),
		verifyAdminPassword: vi.fn(async (password) => ({
			ok: password === "correct",
		})),
		setAdminPassword: vi.fn(async () => ({ hasPassword: true })),
	};
});

const mountApp = async () => {
	const wrapper = mount(App, { global: { plugins: [pinia, i18n] } });
	await new Promise((resolve) => setTimeout(resolve, 0));
	await wrapper.vm.$nextTick();
	return wrapper;
};

describe("operator shell", () => {
	it("shows only the channel view, with no navigation", async () => {
		const wrapper = await mountApp();
		expect(wrapper.find(".operator").exists()).toBe(true);
		expect(wrapper.find(".admin-nav").exists()).toBe(false);
		// None of the technical pages are reachable
		expect(wrapper.text()).not.toContain("Stream-Name");
		expect(wrapper.text()).not.toContain("Netzwerkkarte");
	});

	it("tells the operator to ask technical staff when nothing is set up", async () => {
		const wrapper = await mountApp();
		expect(wrapper.text()).toContain("keine Kanäle eingerichtet");
		expect(wrapper.text()).toContain("Technik");
	});
});

describe("admin shell", () => {
	it("appears once admin mode is on and exposes the technical pages", async () => {
		const wrapper = await mountApp();
		useSessionStore().unlock();
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".admin-nav").exists()).toBe(true);
		expect(wrapper.find(".operator").exists()).toBe(false);
		const labels = wrapper.findAll(".admin-menu-item").map((b) => b.text());
		expect(labels).toHaveLength(5);
		const joined = labels.join(" ");
		for (const label of [
			"Übersicht",
			"Kanäle",
			"Streams",
			"Sender",
			"Einstellungen",
		]) {
			expect(joined).toContain(label);
		}
		// "Geräte" meant both the senders on the network and the local output
		// device, which sent admins looking in the wrong place.
		expect(joined).not.toContain("Geräte");
	});

	it("navigates to the settings page", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		session.unlock();
		await wrapper.vm.$nextTick();

		session.setPage("settings");
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain("Wiedergabegerät");
	});

	it("locking returns to the operator shell", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		session.unlock();
		await wrapper.vm.$nextTick();
		session.lock();
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".operator").exists()).toBe(true);
		expect(session.page).toBe("overview");
	});
});

describe("the admin lock", () => {
	it("opens without asking when no password is configured", async () => {
		const wrapper = await mountApp();
		await wrapper.find(".lock button").trigger("click");
		await wrapper.vm.$nextTick();
		expect(useSessionStore().adminMode).toBe(true);
	});

	it("asks for the password when one is set, and rejects a wrong one", async () => {
		window.electronAPI.getSharedConfig = vi.fn(async () =>
			sharedConfig({ hasPassword: true }),
		);
		const wrapper = await mountApp();

		await wrapper.find(".lock button").trigger("click");
		await wrapper.vm.$nextTick();
		const field = wrapper.find("#admin-password");
		expect(field.exists()).toBe(true);

		await field.setValue("wrong");
		await wrapper.find(".lock-form").trigger("submit");
		await wrapper.vm.$nextTick();
		expect(useSessionStore().adminMode).toBe(false);
		expect(wrapper.find(".lock-error").exists()).toBe(true);

		await field.setValue("correct");
		await wrapper.find(".lock-form").trigger("submit");
		await new Promise((resolve) => setTimeout(resolve, 0));
		await wrapper.vm.$nextTick();
		expect(useSessionStore().adminMode).toBe(true);
	});
});

describe("escaping of network supplied text", () => {
	// Regression: the page title was rendered with v-html, so a stream name
	// from a SAP announcement could inject markup.
	it("escapes a stream name containing markup in the admin title", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		const discovery = useDiscoveryStore();

		discovery.applyStreams([
			{
				id: "abc",
				name: '<img src=x onerror="window.__xss=1">',
				origin: { address: "10.0.100.20" },
				raw: "v=0\n",
				media: [],
				isSupported: false,
				mcast: "239.69.1.1",
			},
		]);
		session.unlock();
		session.openStream("abc");
		await wrapper.vm.$nextTick();

		const title = wrapper.find(".admin-title");
		expect(title.element.querySelector("img")).toBeNull();
		expect(title.text()).toContain("<img");
		expect(window.__xss).toBeUndefined();
	});
});

describe("admin information architecture", () => {
	const supported = (id, extra = {}) => ({
		id,
		name: `Stream ${id}`,
		origin: { address: "10.0.100.20" },
		isSupported: true,
		samplerate: 48000,
		channels: 2,
		codec: "L24",
		mcast: "239.69.1.1",
		media: [{ port: 5004, rtp: [{ codec: "L24", rate: 48000, encoding: 2 }] }],
		raw: "v=0\n",
		...extra,
	});

	const adminAt = async (page) => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		session.unlock();
		if (page) session.setPage(page);
		await wrapper.vm.$nextTick();
		return wrapper;
	};

	it("opens on the overview and says what is missing", async () => {
		const wrapper = await adminAt();
		expect(wrapper.text()).toContain("Übersicht");
		// No adapter, no device, no streams and no channels: all four are stated
		// instead of leaving the admin to infer them from empty pages.
		expect(wrapper.text()).toContain("Netzwerkkarte");
		expect(wrapper.text()).toContain("keine Netzwerkkarte ausgewählt");
		expect(wrapper.text()).toContain("noch keine Kanäle eingerichtet");
	});

	it("shows the admin channel list, not the operator tiles", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		const discovery = useDiscoveryStore();
		discovery.applyStreams([supported("a", { name: "AVIO-1234" })]);

		const { useChannelsStore } = await import("../src/stores/channels.js");
		useChannelsStore().add({ id: "a" });

		session.unlock();
		session.setPage("channels");
		await wrapper.vm.$nextTick();

		// Columns an operator never sees, and the source behind the label
		expect(wrapper.text()).toContain("Quelle");
		expect(wrapper.text()).toContain("Kanalzuordnung");
		expect(wrapper.text()).toContain("AVIO-1234");
		expect(wrapper.text()).toContain("10.0.100.20");
		// The display name is editable right here
		expect(wrapper.find("input[type='text']").exists()).toBe(true);
	});

	it("keeps playback configuration out of the streams table", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		useDiscoveryStore().applyStreams([supported("a")]);
		session.unlock();
		session.setPage("streams");
		await wrapper.vm.$nextTick();

		const headers = wrapper.findAll("th").map((th) => th.text());
		expect(headers.join(" ")).not.toContain("Multicast");
		expect(headers.join(" ")).not.toContain("Kanal");
		expect(headers.join(" ")).toContain("Status");
	});

	it("shows the sender filter as a chip that can be cleared", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		useDiscoveryStore().applyStreams([supported("a")]);
		session.unlock();
		session.setPage("senders");
		await wrapper.vm.$nextTick();

		await wrapper.find(".btn-outline-secondary").trigger("click");
		await wrapper.vm.$nextTick();

		expect(session.page).toBe("streams");
		// Not written into the search box, where it looked like a typed term
		expect(session.search).toBe("");
		const chip = wrapper.find(".chip");
		expect(chip.exists()).toBe(true);
		expect(chip.text()).toContain("10.0.100.20");

		await chip.find("button").trigger("click");
		expect(session.senderFilter).toBe("");
	});

	it("goes back to the page the detail view was opened from", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		useDiscoveryStore().applyStreams([supported("a")]);
		session.unlock();
		session.setPage("senders");
		session.openStream("a");
		await wrapper.vm.$nextTick();

		await wrapper.find(".admin-header .btn-outline-secondary").trigger("click");
		expect(session.page).toBe("senders");
	});
});
