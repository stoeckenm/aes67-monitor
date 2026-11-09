// @vitest-environment jsdom
//
// Smoke test: mounting the whole app catches setup() errors and broken
// imports that a successful bundle alone would not surface.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";

const received = [];

beforeEach(() => {
	received.length = 0;
	// The renderer talks to the main process only through this bridge.
	window.electronAPI = {
		recvMessage: vi.fn(),
		sendMessage: vi.fn((m) => received.push(m)),
		getSharedConfig: vi.fn(async () => ({
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
				streamNames: {},
				hasPassword: false,
			},
			userData: {
				settings: {
					sidebarCollapsed: false,
					window: {
						width: 1280,
						height: 800,
						x: null,
						y: null,
						maximized: true,
					},
					favoritesOrder: [],
				},
			},
		})),
		verifyAdminPassword: vi.fn(async () => ({ ok: true })),
		setAdminPassword: vi.fn(async () => ({ hasPassword: true })),
	};
});

describe("application shell", () => {
	it("mounts and shows the favorites page for a locked operator", async () => {
		const App = (await import("../src/App.vue")).default;
		const wrapper = mount(App);
		await Promise.resolve();

		expect(wrapper.find("#sidebar-left").exists()).toBe(true);
		expect(wrapper.find("#sidebar-top").exists()).toBe(true);
		// Locked: only the favorites entry, no technical pages
		expect(wrapper.find("#favorites-li").exists()).toBe(true);
		expect(wrapper.find("#settings-li").exists()).toBe(false);
		expect(wrapper.find("#streams-li").exists()).toBe(false);
	});

	it("reveals the technical pages once admin mode is on", async () => {
		const App = (await import("../src/App.vue")).default;
		const store = await import("../src/store/state.js");
		store.adminMode.value = true;

		const wrapper = mount(App);
		await wrapper.vm.$nextTick();

		expect(wrapper.find("#settings-li").exists()).toBe(true);
		expect(wrapper.find("#streams-li").exists()).toBe(true);
		store.adminMode.value = false;
	});

	// Regression: the title used to be rendered with v-html, so a stream name
	// from a SAP announcement could inject markup.
	it("escapes a stream name containing markup in the page title", async () => {
		const App = (await import("../src/App.vue")).default;
		const store = await import("../src/store/state.js");
		store.selectedStream.value = {
			id: "abc",
			name: '<img src=x onerror="window.__xss=1">',
			origin: { address: "10.0.100.20" },
			raw: "v=0\no=- 1 1 IN IP4 10.0.100.20\n",
			media: [],
			isSupported: false,
			mcast: "239.69.1.1",
		};
		store.page.value = "stream";

		const wrapper = mount(App);
		await wrapper.vm.$nextTick();

		const title = wrapper.find("#pageTitle");
		expect(title.element.querySelector("img")).toBeNull();
		expect(title.text()).toContain("<img");
		expect(window.__xss).toBeUndefined();

		store.page.value = "favorites";
		store.selectedStream.value = null;
	});
});
