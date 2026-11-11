import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
	sameDevice,
	resolveOutput,
	listForRenderer,
} = require("../backend/system/audioSelection.js");

const dev = (name, extra = {}) => ({
	name,
	inputChannels: 0,
	outputChannels: 2,
	sampleRates: [44100, 48000],
	isDefaultOutput: false,
	isDefaultInput: false,
	id: 0,
	...extra,
});

const speakers = dev("Speakers", { isDefaultOutput: true, id: 1 });
const headset = dev("USB Headset", { id: 2 });
const monitors = dev("Monitors", { id: 3 });

describe("device identity", () => {
	// RtAudio ids shift when devices come and go, which is exactly the case a
	// pinned device has to survive.
	it("matches on name and channel counts, ignoring the id", () => {
		expect(sameDevice(headset, { ...headset, id: 99 })).toBe(true);
		expect(sameDevice(headset, { ...headset, outputChannels: 8 })).toBe(false);
		expect(sameDevice(headset, null)).toBe(false);
		expect(sameDevice(null, null)).toBe(false);
	});
});

describe("following the system default", () => {
	it("wins over a pinned device and over a request", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers, headset],
			pinned: headset,
			requested: monitors,
			followSystem: true,
		});
		expect(device).toBe(speakers);
		expect(reason).toBe("system");
	});

	it("reports none when there is no default to follow", () => {
		expect(resolveOutput({ devices: [headset], followSystem: true })).toEqual({
			device: null,
			reason: "none",
		});
	});
});

describe("the pinned device", () => {
	it("takes over whenever it is present, even against a request", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers, headset],
			pinned: headset,
			requested: speakers,
		});
		expect(device).toBe(headset);
		expect(reason).toBe("pinned");
	});

	// Unplug the USB headphones: playback has to keep working on something.
	it("falls back to the system default while it is unplugged", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers],
			pinned: headset,
		});
		expect(device).toBe(speakers);
		expect(reason).toBe("fallback");
	});

	// Plug them back in: they have to take over again on their own.
	it("takes over again as soon as it reappears", () => {
		const away = resolveOutput({ devices: [speakers], pinned: headset });
		expect(away.reason).toBe("fallback");
		const back = resolveOutput({
			devices: [speakers, headset],
			pinned: headset,
		});
		expect(back.device).toBe(headset);
		expect(back.reason).toBe("pinned");
	});

	it("is ignored when it never was a real device", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers, monitors],
			pinned: { name: "Gone", inputChannels: 0, outputChannels: 2 },
			requested: monitors,
		});
		expect(device).toBe(monitors);
		expect(reason).toBe("fallback");
	});
});

describe("without a pinned device", () => {
	it("uses an explicit choice", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers, monitors],
			requested: monitors,
		});
		expect(device).toBe(monitors);
		expect(reason).toBe("manual");
	});

	it("uses the system default when nothing was chosen", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers, monitors],
		});
		expect(device).toBe(speakers);
		expect(reason).toBe("default");
	});

	it("uses the system default when the choice is gone", () => {
		const { device, reason } = resolveOutput({
			devices: [speakers],
			requested: headset,
		});
		expect(device).toBe(speakers);
		expect(reason).toBe("default");
	});

	it("reports none when there is no device at all", () => {
		expect(resolveOutput({ devices: [] })).toEqual({
			device: null,
			reason: "none",
		});
		expect(resolveOutput()).toEqual({ device: null, reason: "none" });
	});
});

describe("the list the renderer gets", () => {
	it("flags the current and the pinned device", () => {
		const list = listForRenderer({
			devices: [speakers, headset],
			pinned: headset,
			current: headset,
		});
		expect(
			list.map((d) => [d.name, d.isCurrent, d.isPinned, d.absent]),
		).toEqual([
			["Speakers", false, false, false],
			["USB Headset", true, true, false],
		]);
	});

	// The only place the preference can be seen and removed.
	it("keeps an unplugged pinned device in the list, marked absent", () => {
		const list = listForRenderer({
			devices: [speakers],
			pinned: headset,
			current: speakers,
		});
		expect(list).toHaveLength(2);
		const pinned = list.find((d) => d.isPinned);
		expect(pinned.name).toBe("USB Headset");
		expect(pinned.absent).toBe(true);
		expect(pinned.isCurrent).toBe(false);
		expect(pinned.outputChannels).toBe(2);
	});

	it("does not duplicate the pinned device when it is present", () => {
		const list = listForRenderer({
			devices: [speakers, headset],
			pinned: headset,
			current: speakers,
		});
		expect(list.filter((d) => d.isPinned)).toHaveLength(1);
		expect(list.every((d) => d.absent === false)).toBe(true);
	});

	it("drops devices with no channels at all", () => {
		const list = listForRenderer({
			devices: [
				speakers,
				dev("Dummy", { inputChannels: 0, outputChannels: 0 }),
			],
		});
		expect(list.map((d) => d.name)).toEqual(["Speakers"]);
	});
});
