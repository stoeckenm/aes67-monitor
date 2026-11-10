import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isUrlWithinApp } = require("../backend/system/navigation.js");

const dev = { packaged: false, devServerUrl: "http://localhost:8888" };
const packaged = { packaged: true, distUrl: "file:///C:/app/dist" };

describe("navigation guard, development", () => {
	it("allows the dev server itself and anything below it", () => {
		expect(isUrlWithinApp("http://localhost:8888", dev)).toBe(true);
		expect(isUrlWithinApp("http://localhost:8888/", dev)).toBe(true);
		expect(isUrlWithinApp("http://localhost:8888/index.html", dev)).toBe(true);
		expect(isUrlWithinApp("http://localhost:8888/?x=1", dev)).toBe(true);
	});

	it("refuses another port, host or scheme", () => {
		expect(isUrlWithinApp("http://localhost:8889/", dev)).toBe(false);
		expect(isUrlWithinApp("http://evil.example/", dev)).toBe(false);
		expect(isUrlWithinApp("https://localhost:8888/", dev)).toBe(false);
	});
});

describe("navigation guard, packaged", () => {
	it("allows the bundle directory and anything below it", () => {
		expect(isUrlWithinApp("file:///C:/app/dist", packaged)).toBe(true);
		expect(isUrlWithinApp("file:///C:/app/dist/index.html", packaged)).toBe(
			true,
		);
		expect(
			isUrlWithinApp("file:///C:/app/dist/assets/index-abc.js", packaged),
		).toBe(true);
	});

	// A bare startsWith() on the base would accept this sibling directory.
	it("refuses a sibling directory sharing the base's prefix", () => {
		expect(isUrlWithinApp("file:///C:/app/distother/evil.html", packaged)).toBe(
			false,
		);
	});

	it("refuses escaping above the bundle directory", () => {
		expect(isUrlWithinApp("file:///C:/app/config.json", packaged)).toBe(false);
		expect(isUrlWithinApp("file:///C:/Windows/System32/x.html", packaged)).toBe(
			false,
		);
	});

	it("ignores the dev server once packaged", () => {
		expect(isUrlWithinApp("http://localhost:8888/", packaged)).toBe(false);
	});
});

describe("navigation guard, hostile and malformed input", () => {
	// These are the shapes a stream name from a SAP announcement could carry
	// into an href, so each one has to come back false rather than throw.
	it.each([
		"javascript:alert(1)",
		"about:blank",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
		"not a url",
		"",
	])("refuses %j", (url) => {
		expect(isUrlWithinApp(url, dev)).toBe(false);
		expect(isUrlWithinApp(url, packaged)).toBe(false);
	});

	it("refuses non-string and missing input without throwing", () => {
		expect(isUrlWithinApp(undefined, dev)).toBe(false);
		expect(isUrlWithinApp(null, dev)).toBe(false);
		expect(isUrlWithinApp(42, dev)).toBe(false);
		expect(isUrlWithinApp("http://localhost:8888/")).toBe(false);
		expect(isUrlWithinApp("http://localhost:8888/", {})).toBe(false);
	});
});
