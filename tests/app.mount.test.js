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
		expect(wrapper.text()).not.toContain("Multicast");
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
		expect(labels.join(" ")).toContain("Streams");
		expect(labels.join(" ")).toContain("Einstellungen");
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
		expect(session.page).toBe("favorites");
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
