import { describe, it, expect } from "vitest";
import { selectionSentence, deviceBadges } from "../src/utils/audioStatus.js";

describe("the sentence above the device list", () => {
	it("names the device and the reason it is in use", () => {
		expect(
			selectionSentence({ reason: "pinned", name: "USB Headset" }),
		).toEqual({
			key: "audio.reasonPinned",
			params: { name: "USB Headset" },
		});
		expect(selectionSentence({ reason: "fallback", name: "Speakers" })).toEqual(
			{
				key: "audio.reasonFallback",
				params: { name: "Speakers" },
			},
		);
		expect(selectionSentence({ reason: "manual", name: "Monitors" }).key).toBe(
			"audio.reasonManual",
		);
		expect(selectionSentence({ reason: "system", name: "Speakers" }).key).toBe(
			"audio.reasonSystem",
		);
		expect(selectionSentence({ reason: "default", name: "Speakers" }).key).toBe(
			"audio.reasonDefault",
		);
	});

	it("falls back to the no-device sentence for anything unknown", () => {
		for (const input of [undefined, null, {}, { reason: "nonsense" }]) {
			expect(selectionSentence(input)).toEqual({
				key: "audio.reasonNone",
				params: {},
			});
		}
	});
});

describe("the badges on a device row", () => {
	it("marks the device in use", () => {
		expect(deviceBadges({ isCurrent: true }).map((b) => b.key)).toEqual([
			"audio.inUse",
		]);
	});

	it("marks an unplugged preferred device as absent, not as in use", () => {
		const badges = deviceBadges({ absent: true, isPinned: true });
		expect(badges.map((b) => b.key)).toEqual([
			"audio.absent",
			"audio.preferred",
		]);
	});

	// The original showed exactly this as "Overwritten": a preference that
	// cannot take effect must not look as if it were doing something.
	it("marks a preference that following the system overrides", () => {
		const overridden = deviceBadges({ isPinned: true }, true);
		expect(overridden.map((b) => b.key)).toEqual(["audio.preferred"]);
		expect(overridden[0].suffixKey).toBe("audio.ignored");

		const effective = deviceBadges({ isPinned: true }, false);
		expect(effective[0].key).toBe("audio.preferred");
		expect(effective[0].suffixKey).toBeUndefined();
	});

	it("marks the system default alongside the rest", () => {
		const badges = deviceBadges({ isCurrent: true, isDefaultOutput: true });
		expect(badges.map((b) => b.key)).toEqual([
			"audio.inUse",
			"audio.systemDefault",
		]);
	});

	it("returns nothing for a missing device", () => {
		expect(deviceBadges(null)).toEqual([]);
		expect(deviceBadges(undefined)).toEqual([]);
	});
});
