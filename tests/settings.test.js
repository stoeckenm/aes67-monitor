import { describe, it, expect } from "vitest";
import {
	bufferLevelOf,
	applyBufferLevel,
	samplesPerPacket,
	outSampleFactor,
	effectiveBufferSize,
	timeoutKeyOf,
	applyTimeoutKey,
} from "../src/config/presets.js";

describe("buffer levels", () => {
	it("recognizes the named levels and the previous default", () => {
		expect(bufferLevelOf({ bufferEnabled: true, bufferSize: 4 })).toBe("low");
		expect(bufferLevelOf({ bufferEnabled: true, bufferSize: 16 })).toBe(
			"standard",
		);
		expect(bufferLevelOf({ bufferEnabled: true, bufferSize: 48 })).toBe(
			"stable",
		);
	});

	it("reports a hand set value as custom and a disabled buffer as off", () => {
		expect(bufferLevelOf({ bufferEnabled: true, bufferSize: 23 })).toBe(
			"custom",
		);
		expect(bufferLevelOf({ bufferEnabled: false, bufferSize: 16 })).toBe("off");
	});

	it("round trips through applyBufferLevel", () => {
		for (const key of ["low", "standard", "stable", "off"]) {
			const settings = { bufferEnabled: true, bufferSize: 16 };
			applyBufferLevel(settings, key);
			expect(bufferLevelOf(settings), key).toBe(key);
		}
	});

	it("ignores an unknown level instead of corrupting the settings", () => {
		const settings = { bufferEnabled: true, bufferSize: 16 };
		applyBufferLevel(settings, "nonsense");
		expect(settings).toEqual({ bufferEnabled: true, bufferSize: 16 });
	});
});

describe("packet maths, mirroring the playback worker", () => {
	it("derives samples per packet from rate and packet time", () => {
		expect(samplesPerPacket(48000, 1)).toBe(48);
		expect(samplesPerPacket(96000, 0.125)).toBe(12);
		expect(samplesPerPacket(44100, 1)).toBe(44);
	});

	it("defaults a missing packet time to 1 ms", () => {
		expect(samplesPerPacket(48000, undefined)).toBe(48);
	});

	it("raises the write size until at least 48 samples are written", () => {
		expect(outSampleFactor(48000, 1)).toBe(1);
		expect(outSampleFactor(48000, 0.125)).toBe(8);
		expect(outSampleFactor(96000, 0.125)).toBe(4);
	});

	// The worker silently raises the jitter buffer for short packet times, so
	// the configured number is not always the one in effect.
	it("reports the buffer actually in effect for short packet times", () => {
		const settings = { bufferEnabled: true, bufferSize: 4 };
		expect(effectiveBufferSize(settings, { samplerate: 48000, ptime: 1 })).toBe(
			4,
		);
		expect(
			effectiveBufferSize(settings, { samplerate: 48000, ptime: 0.125 }),
		).toBe(8);
	});

	it("reports zero when buffering is switched off", () => {
		expect(
			effectiveBufferSize({ bufferEnabled: false, bufferSize: 16 }, null),
		).toBe(0);
	});
});

describe("discovery timeout", () => {
	it("maps the stored seconds onto the named choices", () => {
		expect(timeoutKeyOf({ sdpDeleteTimeout: 60 })).toBe("short");
		expect(timeoutKeyOf({ sdpDeleteTimeout: 300 })).toBe("default");
		expect(timeoutKeyOf({ sdpDeleteTimeout: 0 })).toBe("never");
		expect(timeoutKeyOf({ sdpDeleteTimeout: 123 })).toBe("custom");
	});

	it("round trips", () => {
		for (const key of ["short", "default", "never"]) {
			const settings = { sdpDeleteTimeout: 300 };
			applyTimeoutKey(settings, key);
			expect(timeoutKeyOf(settings), key).toBe(key);
		}
	});
});
