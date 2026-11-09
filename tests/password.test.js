import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
	hashPassword,
	verifyPassword,
} = require("../backend/system/password.js");

describe("admin password", () => {
	it("stores a salted scrypt hash, not the password", async () => {
		const stored = await hashPassword("geheim");
		expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
		expect(stored).not.toContain("geheim");
	});

	it("uses a fresh salt per call", async () => {
		const a = await hashPassword("geheim");
		const b = await hashPassword("geheim");
		expect(a).not.toBe(b);
	});

	it("accepts the correct password and rejects a wrong one", async () => {
		const stored = await hashPassword("geheim");
		expect(await verifyPassword("geheim", stored)).toEqual({
			ok: true,
			needsRehash: false,
		});
		expect((await verifyPassword("falsch", stored)).ok).toBe(false);
	});

	// Installations written by earlier versions carry an unsalted SHA-256 hex
	// digest. It has to keep working, and be upgraded on first successful use.
	it("still accepts a legacy SHA-256 hash and asks for a rehash", async () => {
		const legacy = crypto.createHash("sha256").update("altes").digest("hex");
		expect(await verifyPassword("altes", legacy)).toEqual({
			ok: true,
			needsRehash: true,
		});
		expect(await verifyPassword("nein", legacy)).toEqual({
			ok: false,
			needsRehash: false,
		});
	});

	it("rejects anything when no hash is stored", async () => {
		for (const stored of [null, undefined, "", "not-a-hash"]) {
			expect((await verifyPassword("x", stored)).ok, String(stored)).toBe(
				false,
			);
		}
	});

	it("does not throw on a malformed scrypt record", async () => {
		for (const stored of ["scrypt$", "scrypt$abc", "scrypt$$"]) {
			await expect(verifyPassword("x", stored)).resolves.toMatchObject({
				ok: false,
			});
		}
	});
});
