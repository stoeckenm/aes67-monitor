import { describe, it, expect } from "vitest";
import de from "../src/locales/de.json";
import en from "../src/locales/en.json";

const flatten = (node, prefix = "") =>
	Object.entries(node).flatMap(([key, value]) =>
		value && typeof value === "object"
			? flatten(value, `${prefix}${key}.`)
			: [`${prefix}${key}`],
	);

describe("locale parity", () => {
	// de.json is the source of truth and en.json is kept at key parity. A
	// missing key falls back silently to the raw key, which reads as a bug in
	// the UI rather than a missing translation.
	it("has the same keys in both files", () => {
		const deKeys = flatten(de).sort();
		const enKeys = flatten(en).sort();
		expect(enKeys).toEqual(deKeys);
	});

	it("has no empty strings", () => {
		const empty = [];
		for (const [name, tree] of [
			["de", de],
			["en", en],
		]) {
			const walk = (node, prefix = "") => {
				for (const [key, value] of Object.entries(node)) {
					if (value && typeof value === "object")
						walk(value, `${prefix}${key}.`);
					else if (typeof value !== "string" || value.trim() === "") {
						empty.push(`${name}:${prefix}${key}`);
					}
				}
			};
			walk(tree);
		}
		expect(empty).toEqual([]);
	});

	it("keeps the same interpolation placeholders on both sides", () => {
		const placeholders = (text) =>
			(String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
		const read = (tree, path) =>
			path.split(".").reduce((node, key) => node?.[key], tree);

		const mismatched = flatten(de).filter((key) => {
			const left = placeholders(read(de, key));
			const right = placeholders(read(en, key));
			return JSON.stringify(left) !== JSON.stringify(right);
		});
		expect(mismatched).toEqual([]);
	});
});

describe("message syntax that vue-i18n would reject", () => {
	// Regression: "{count} Kanäle @ {rate} Hz" did not compile, because "@" is
	// vue-i18n's linked-message syntax. The message threw while rendering the
	// stream detail page for any stream carrying an rtp entry.
	const strings = (tree, prefix = "") =>
		Object.entries(tree).flatMap(([key, value]) =>
			value && typeof value === "object"
				? strings(value, `${prefix}${key}.`)
				: [[`${prefix}${key}`, value]],
		);

	it.each([
		["de", de],
		["en", en],
	])("has no unescaped @ or | in %s", (_name, tree) => {
		const offenders = strings(tree)
			.filter(([, value]) => /@|\|/.test(String(value)))
			.map(([key]) => key);
		expect(offenders).toEqual([]);
	});
});
