// system/password.js
//
// The admin lock is a guard against accidental operation, not an access
// control: anyone who can read the config file can replace the hash. It is
// still verified here in the main process rather than in the renderer, so the
// stored hash never has to leave this process.
const crypto = require("node:crypto");

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const SCRYPT_PREFIX = "scrypt";
const LEGACY_SHA256 = /^[0-9a-f]{64}$/i;

function scrypt(password, salt) {
	return new Promise((resolve, reject) => {
		crypto.scrypt(password, salt, KEY_BYTES, (err, derived) => {
			if (err) reject(err);
			else resolve(derived);
		});
	});
}

// Stored as "scrypt$<saltHex>$<keyHex>"
module.exports.hashPassword = async (password) => {
	const salt = crypto.randomBytes(SALT_BYTES);
	const derived = await scrypt(password, salt);
	return `${SCRYPT_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
};

// Returns { ok, needsRehash }. needsRehash is set when the password matched a
// legacy unsalted SHA-256 hash, so the caller can upgrade it in place.
module.exports.verifyPassword = async (password, stored) => {
	if (!stored || typeof stored !== "string" || typeof password !== "string") {
		return { ok: false, needsRehash: false };
	}

	if (stored.startsWith(`${SCRYPT_PREFIX}$`)) {
		const [, saltHex, keyHex] = stored.split("$");
		if (!saltHex || !keyHex) return { ok: false, needsRehash: false };

		let expected;
		try {
			expected = Buffer.from(keyHex, "hex");
		} catch {
			return { ok: false, needsRehash: false };
		}
		const derived = await scrypt(password, Buffer.from(saltHex, "hex"));
		const ok =
			derived.length === expected.length &&
			crypto.timingSafeEqual(derived, expected);
		return { ok, needsRehash: false };
	}

	// Hashes written by earlier versions: unsalted SHA-256 hex
	if (LEGACY_SHA256.test(stored)) {
		const digest = crypto.createHash("sha256").update(password).digest();
		const expected = Buffer.from(stored, "hex");
		const ok =
			digest.length === expected.length &&
			crypto.timingSafeEqual(digest, expected);
		return { ok, needsRehash: ok };
	}

	return { ok: false, needsRehash: false };
};
