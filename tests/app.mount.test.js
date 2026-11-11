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
			theme: "system",
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
		expect(labels).toHaveLength(6);
		const joined = labels.join(" ");
		for (const label of [
			"Übersicht",
			"Kanäle",
			"Streams",
			"Sender",
			"Audiogeräte",
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

describe("the preferred audio device", () => {
	const dev = (name, extra = {}) => ({
		name,
		inputChannels: 0,
		outputChannels: 2,
		sampleRates: [48000, 96000],
		isDefaultOutput: false,
		isCurrent: false,
		isPinned: false,
		absent: false,
		...extra,
	});

	const audioPage = async (devices, selection, overrides = {}) => {
		window.electronAPI.getSharedConfig = vi.fn(async () =>
			sharedConfig(overrides),
		);
		const wrapper = await mountApp();
		const session = useSessionStore();
		const discovery = useDiscoveryStore();
		discovery.audioDevices = devices;
		discovery.audioSelection = selection;
		session.unlock();
		session.setPage("audio");
		await wrapper.vm.$nextTick();
		return wrapper;
	};

	it("states which device is in use and why", async () => {
		const wrapper = await audioPage(
			[
				dev("Speakers", { isDefaultOutput: true }),
				dev("USB Headset", { isCurrent: true, isPinned: true }),
			],
			{ reason: "pinned", name: "USB Headset" },
			{ settings: { followSystemAudio: false } },
		);
		expect(wrapper.text()).toContain(
			"Bevorzugtes Gerät ist aktiv: USB Headset",
		);
	});

	// The whole point of the preference: unplug the headset, playback keeps
	// going, and the page says it will come back on its own.
	it("keeps an unplugged preferred device listed and explains the fallback", async () => {
		const wrapper = await audioPage(
			[
				dev("Speakers", { isDefaultOutput: true, isCurrent: true }),
				dev("USB Headset", { isPinned: true, absent: true, sampleRates: [] }),
			],
			{ reason: "fallback", name: "Speakers" },
			{ settings: { followSystemAudio: false } },
		);

		expect(wrapper.text()).toContain("USB Headset");
		expect(wrapper.text()).toContain("Nicht angeschlossen");
		expect(wrapper.text()).toContain("übernimmt es von selbst");
	});

	// Said out loud rather than silently ignored, which is what made the old
	// device list look broken.
	it("marks a preference that following the system overrides", async () => {
		const wrapper = await audioPage(
			[
				dev("Speakers", { isDefaultOutput: true, isCurrent: true }),
				dev("USB Headset", { isPinned: true }),
			],
			{ reason: "system", name: "Speakers" },
			{ settings: { followSystemAudio: true } },
		);
		expect(wrapper.text()).toContain("ohne Wirkung");
	});

	it("asks main to set and clear the preference", async () => {
		const wrapper = await audioPage(
			[dev("Speakers", { isDefaultOutput: true, isCurrent: true })],
			{ reason: "default", name: "Speakers" },
			{ settings: { followSystemAudio: false } },
		);

		await wrapper.find(".btn-outline-warning").trigger("click");
		const asked = sent.filter((m) => m.type === "setPreferredAudioInterface");
		expect(asked).toHaveLength(1);
		expect(asked[0].data).toEqual({
			name: "Speakers",
			inputChannels: 0,
			outputChannels: 2,
		});
	});

	it("moved out of the settings page, which points at it", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		session.unlock();
		session.setPage("settings");
		await wrapper.vm.$nextTick();

		expect(wrapper.text()).toContain("Audiogeräte");
		// The radio list of devices is no longer here
		expect(wrapper.find("input[name='output-device']").exists()).toBe(false);
	});
});

describe("what the operator tile says", () => {
	const stream = (id, extra = {}) => ({
		id,
		name: `Stream ${id}`,
		isSupported: true,
		samplerate: 48000,
		channels: 2,
		codec: "L24",
		mcast: "239.69.1.1",
		media: [{ port: 5004, rtp: [{ codec: "L24", rate: 48000, encoding: 2 }] }],
		...extra,
	});

	const withChannel = async (streams, devices) => {
		const wrapper = await mountApp();
		const discovery = useDiscoveryStore();
		discovery.audioDevices = devices;
		discovery.applyStreams(streams);
		const { useChannelsStore } = await import("../src/stores/channels.js");
		useChannelsStore().add({ id: "a" });
		await wrapper.vm.$nextTick();
		return wrapper;
	};

	const speakers = [
		{
			name: "Speakers",
			inputChannels: 0,
			outputChannels: 2,
			isCurrent: true,
			sampleRates: [48000],
		},
	];

	it("says a channel is ready and offers the one button", async () => {
		const wrapper = await withChannel([stream("a")], speakers);
		expect(wrapper.find(".channel-state-text").text()).toBe("Bereit");
		const button = wrapper.find(".channel-button");
		expect(button.text()).toContain("Abhören");
		expect(button.attributes("disabled")).toBeUndefined();
	});

	// A configured channel that is gone has to stay visible and say so, rather
	// than leaving the operator with an empty page.
	it("says a channel is not on the network, with its button disabled", async () => {
		const wrapper = await withChannel([], speakers);
		expect(wrapper.find(".channel-state-text").text()).toBe(
			"Zurzeit nicht im Netz",
		);
		expect(wrapper.find(".channel").classes()).toContain("is-offline");
		expect(
			wrapper.find(".channel-button").attributes("disabled"),
		).toBeDefined();
	});

	it("says the output device cannot play the format", async () => {
		const wrapper = await withChannel(
			[stream("a", { samplerate: 96000 })],
			speakers,
		);
		expect(wrapper.find(".channel-state-text").text()).toContain(
			"nicht unterstützt",
		);
		expect(wrapper.find(".channel").classes()).toContain("is-blocked");
	});

	it("marks the channel that is playing", async () => {
		const wrapper = await withChannel([stream("a")], speakers);
		await wrapper.find(".channel-button").trigger("click");
		await wrapper.vm.$nextTick();

		expect(wrapper.find(".channel").classes()).toContain("is-playing");
		expect(wrapper.find(".channel-state-text").text()).toBe("Läuft");
		expect(wrapper.find(".channel-button").text()).toContain("Stopp");
		expect(sent.some((m) => m.type === "play")).toBe(true);
	});
});

describe("the colour scheme", () => {
	it("applies the stored choice and remembers a change", async () => {
		const wrapper = await mountApp();
		const session = useSessionStore();
		const { useConfigStore } = await import("../src/stores/config.js");
		const config = useConfigStore();

		session.unlock();
		session.setPage("settings");
		config.setSettingsTab("appearance");
		await wrapper.vm.$nextTick();

		expect(wrapper.text()).toContain("Farbschema");
		// Per user, not machine-wide: worth saying on the page itself.
		expect(wrapper.text()).toContain("nur für diesen Benutzer");

		const dark = wrapper.findAll("button").find((b) => b.text() === "Dunkel");
		await dark.trigger("click");
		await wrapper.vm.$nextTick();

		expect(config.user.settings.theme).toBe("dark");
		expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
	});
});
