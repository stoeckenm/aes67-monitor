import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
	migrateDevices,
	mergePersistent,
	mergeUser,
	forRenderer,
} = require("../backend/persistence/migrate.js");

describe("device store migration", () => {
	// Regression: devices was declared as an array but addressed as a map keyed
	// by IP, and both merge paths reset it to [], so renames never survived.
	it("converts a legacy array into a map keyed by address", () => {
		const r = migrateDevices([
			{ address: "10.0.0.5", name: "Pult", description: "Regie" },
			{ address: "10.0.0.6" },
		]);
		expect(r.changed).toBe(true);
		expect(r.value).toEqual({
			"10.0.0.5": { name: "Pult", description: "Regie" },
			"10.0.0.6": { name: "10.0.0.6", description: "-" },
		});
	});

	it("leaves an existing map untouched and reports no change", () => {
		const existing = { "10.0.0.5": { name: "Pult", description: "Regie" } };
		const r = migrateDevices(existing);
		expect(r.changed).toBe(false);
		expect(r.value).toBe(existing);
	});

	it("treats missing or unusable values as an empty map", () => {
		for (const input of [undefined, null, "nonsense", 42]) {
			const r = migrateDevices(input);
			expect(r.value, String(input)).toEqual({});
			expect(r.changed).toBe(true);
		}
	});

	it("skips array entries without an address", () => {
		const r = migrateDevices([
			{ name: "orphan" },
			null,
			{ address: "10.0.0.7" },
		]);
		expect(Object.keys(r.value)).toEqual(["10.0.0.7"]);
	});
});

describe("persistent config merge", () => {
	it("fills in defaults for a config written by an older version", () => {
		const { merged } = mergePersistent({ settings: { bufferSize: 32 } });
		expect(merged.settings.bufferSize).toBe(32);
		expect(merged.settings.sdpDeleteTimeout).toBe(300);
		expect(merged.devices).toEqual({});
		expect(merged.favorites).toEqual([]);
		expect(merged.streamNames).toEqual({});
		expect(merged.passwordHash).toBeNull();
	});

	// Regression: adminMode was persisted here, so kiosk machines came back up
	// unlocked after a restart.
	it("drops a persisted adminMode and flags the config as migrated", () => {
		const { merged, changed } = mergePersistent({
			devices: {},
			adminMode: true,
		});
		expect("adminMode" in merged).toBe(false);
		expect(changed).toBe(true);
	});

	it("keeps a stored password hash but discards a non-string one", () => {
		expect(
			mergePersistent({ devices: {}, passwordHash: "abc" }).merged.passwordHash,
		).toBe("abc");
		expect(
			mergePersistent({ devices: {}, passwordHash: 123 }).merged.passwordHash,
		).toBeNull();
	});

	it("reports no migration for an already current config", () => {
		const { changed } = mergePersistent({
			settings: {},
			network: {},
			devices: {},
			favorites: [],
			streamNames: {},
			passwordHash: null,
		});
		expect(changed).toBe(false);
	});
});

describe("user config merge", () => {
	// Regression: the shared merge also injected network, devices and favorites
	// into user.json.
	it("keeps only UI settings and no foreign keys", () => {
		const { merged } = mergeUser({
			settings: { sidebarCollapsed: true },
			devices: { "10.0.0.5": {} },
			favorites: [{ id: "x" }],
			network: { currentInterface: "10.0.0.1" },
		});
		expect(Object.keys(merged)).toEqual(["settings"]);
		expect(merged.settings.sidebarCollapsed).toBe(true);
		expect(merged.settings.window.width).toBe(1280);
	});
});

describe("renderer view of the config", () => {
	it("replaces the hash with a boolean flag", () => {
		const view = forRenderer({ settings: {}, passwordHash: "scrypt$a$b" });
		expect(view.hasPassword).toBe(true);
		expect("passwordHash" in view).toBe(false);
	});

	it("reports no password when none is stored", () => {
		expect(forRenderer({ settings: {}, passwordHash: null }).hasPassword).toBe(
			false,
		);
	});
});
