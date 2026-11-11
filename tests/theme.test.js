import { describe, it, expect } from "vitest";
import { resolveTheme, THEME_CHOICES } from "../src/utils/theme.js";

describe("colour scheme resolution", () => {
	it("takes an explicit choice literally", () => {
		expect(resolveTheme("light", true)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
	});

	it("follows the system when asked to", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
	});

	// A config written by a newer version must not pin an old build to the
	// wrong scheme.
	it("follows the system for anything it does not recognise", () => {
		for (const choice of [undefined, null, "", "sepia", 42]) {
			expect(resolveTheme(choice, true)).toBe("dark");
			expect(resolveTheme(choice, false)).toBe("light");
		}
	});

	it("offers exactly the three choices the settings page shows", () => {
		expect(THEME_CHOICES).toEqual(["system", "light", "dark"]);
	});
});
