import { describe, it, expect } from "vitest";
import { ageLabel } from "../src/utils/relativeTime.js";

const NOW = 1_700_000_000_000;

describe("age of the last announcement", () => {
	it("says nothing was received when there is no timestamp", () => {
		expect(ageLabel(0, NOW).key).toBe("overview.lastUpdateNever");
		expect(ageLabel(undefined, NOW).key).toBe("overview.lastUpdateNever");
	});

	it("reads as just now for the first few seconds", () => {
		expect(ageLabel(NOW, NOW).key).toBe("overview.justNow");
		expect(ageLabel(NOW - 4000, NOW).key).toBe("overview.justNow");
	});

	it("counts seconds below a minute", () => {
		expect(ageLabel(NOW - 30_000, NOW)).toEqual({
			key: "overview.secondsAgo",
			params: { count: 30 },
		});
		expect(ageLabel(NOW - 59_000, NOW).params.count).toBe(59);
	});

	it("switches to minutes at sixty seconds", () => {
		expect(ageLabel(NOW - 60_000, NOW)).toEqual({
			key: "overview.minutesAgo",
			params: { count: 1 },
		});
		expect(ageLabel(NOW - 3_600_000, NOW).params.count).toBe(60);
	});

	// A clock correction can put the timestamp in the future, which must not
	// read as a negative age.
	it("treats a future timestamp as just now", () => {
		expect(ageLabel(NOW + 10_000, NOW).key).toBe("overview.justNow");
	});
});
