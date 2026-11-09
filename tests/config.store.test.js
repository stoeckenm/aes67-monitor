// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";
import { useConfigStore } from "../src/stores/config.js";

const sent = [];

const snapshot = (overrides = {}) => ({
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
});

let config;

beforeEach(() => {
	sent.length = 0;
	vi.useFakeTimers();
	setActivePinia(createPinia());
	window.electronAPI = {
		recvMessage: vi.fn(),
		sendMessage: vi.fn((m) => sent.push(m)),
		getSharedConfig: vi.fn(async () => ({
			persistentData: snapshot(),
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
	};
	config = useConfigStore();
});

const settle = async () => {
	await nextTick();
	vi.advanceTimersByTime(500);
	await nextTick();
};

describe("save ping-pong", () => {
	// Regression: the guard used to be a boolean cleared synchronously, but Vue
	// flushes watchers asynchronously, so it was already false by the time the
	// callback ran and every push from main bounced a save straight back.
	it("does not save in response to a push from main", async () => {
		config.startWatchers();
		config.applyFromMain(snapshot());
		await settle();

		expect(sent.filter((m) => m.type === "savePersistent")).toHaveLength(0);
	});

	it("still saves a genuine local change", async () => {
		config.applyFromMain(snapshot());
		config.startWatchers();

		config.settings.bufferSize = 48;
		await settle();

		const saves = sent.filter((m) => m.type === "savePersistent");
		expect(saves).toHaveLength(1);
		expect(JSON.parse(saves[0].data).settings.bufferSize).toBe(48);
	});

	it("collapses repeated changes into one save", async () => {
		config.applyFromMain(snapshot());
		config.startWatchers();

		config.settings.bufferSize = 20;
		config.settings.bufferSize = 24;
		config.settings.bufferSize = 32;
		await settle();

		expect(sent.filter((m) => m.type === "savePersistent")).toHaveLength(1);
	});

	it("does not save when a change is reverted before the debounce fires", async () => {
		config.applyFromMain(snapshot());
		config.startWatchers();

		config.settings.bufferSize = 48;
		config.settings.bufferSize = 16;
		await settle();

		expect(sent.filter((m) => m.type === "savePersistent")).toHaveLength(0);
	});
});

describe("names and device info", () => {
	it("stores and clears a friendly name", () => {
		config.setName("abc", "  Studio B  ");
		expect(config.nameOf("abc")).toBe("Studio B");
		config.setName("abc", "   ");
		expect(config.nameOf("abc")).toBe("");
	});

	it("ignores a name without a stream id", () => {
		config.setName("", "x");
		expect(config.persistent.streamNames).toEqual({});
	});

	it("stores device info keyed by address", () => {
		config.setDeviceInfo("10.0.0.5", { name: "Pult", description: "Regie" });
		expect(config.deviceInfo("10.0.0.5")).toEqual({
			name: "Pult",
			description: "Regie",
		});
		expect(config.deviceInfo("10.0.0.9")).toBeNull();
	});
});
