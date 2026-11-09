// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { streams, persistentData, playing } from "../src/store/state.js";
import {
	resolvedFavorites,
	favoriteIds,
	favoriteCount,
	isFavorite,
	addFavorite,
	removeFavorite,
	toggleFavorite,
	reorderFavorites,
} from "../src/store/favorites.js";

const stream = (id, extra = {}) => ({
	id,
	name: `Stream ${id}`,
	isSupported: true,
	samplerate: 48000,
	...extra,
});

beforeEach(() => {
	// No electronAPI: the save helpers return early, which is what we want here
	persistentData.value.favorites = [];
	persistentData.value.streamNames = {};
	streams.value = [];
	playing.value = "";
});

describe("favorite bookkeeping", () => {
	it("stores a reference, never the stream object", () => {
		addFavorite(stream("a"));
		expect(persistentData.value.favorites).toEqual([{ id: "a", order: 0 }]);
	});

	it("ignores a duplicate and a stream without an id", () => {
		addFavorite(stream("a"));
		addFavorite(stream("a"));
		addFavorite({ name: "no id" });
		expect(favoriteCount.value).toBe(1);
	});

	it("renumbers after a removal so order stays contiguous", () => {
		["a", "b", "c"].forEach((id) => addFavorite(stream(id)));
		removeFavorite("b");
		expect(persistentData.value.favorites).toEqual([
			{ id: "a", order: 0 },
			{ id: "c", order: 1 },
		]);
	});

	it("toggles both ways", () => {
		const s = stream("a");
		toggleFavorite(s);
		expect(isFavorite(s)).toBe(true);
		toggleFavorite(s);
		expect(isFavorite(s)).toBe(false);
	});

	it("exposes the ids as a set", () => {
		addFavorite(stream("a"));
		expect(favoriteIds.value.has("a")).toBe(true);
		expect(favoriteIds.value.has("z")).toBe(false);
	});
});

describe("reordering", () => {
	beforeEach(() => {
		["a", "b", "c"].forEach((id) => addFavorite(stream(id)));
	});

	it("applies the given display order", () => {
		reorderFavorites(["c", "a", "b"]);
		expect(persistentData.value.favorites).toEqual([
			{ id: "c", order: 0 },
			{ id: "a", order: 1 },
			{ id: "b", order: 2 },
		]);
	});

	it("keeps entries the caller did not mention", () => {
		reorderFavorites(["c"]);
		expect(persistentData.value.favorites.map((f) => f.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("ignores ids that are not favorites", () => {
		reorderFavorites(["zzz", "b", "a", "c"]);
		expect(persistentData.value.favorites.map((f) => f.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});
});

describe("resolution against live discovery", () => {
	it("joins a favorite with the stream currently announced", () => {
		streams.value = [stream("a", { name: "Regie" })];
		addFavorite(stream("a"));

		const [favorite] = resolvedFavorites.value;
		expect(favorite.online).toBe(true);
		expect(favorite.playable).toBe(true);
		expect(favorite.name).toBe("Regie");
	});

	// The operator must see that a configured channel is gone, rather than an
	// empty page.
	it("keeps a favorite whose stream is absent and marks it offline", () => {
		addFavorite(stream("gone"));
		streams.value = [];

		const [favorite] = resolvedFavorites.value;
		expect(favorite.online).toBe(false);
		expect(favorite.playable).toBe(false);
	});

	it("prefers the stored friendly name over the announced one", () => {
		streams.value = [stream("a", { name: "AVIO-1234" })];
		addFavorite(stream("a"));
		persistentData.value.streamNames = { a: "Studio B" };

		expect(resolvedFavorites.value[0].name).toBe("Studio B");
	});

	it("keeps the name of an offline favorite", () => {
		addFavorite(stream("a"));
		persistentData.value.streamNames = { a: "Studio B" };
		expect(resolvedFavorites.value[0].name).toBe("Studio B");
	});

	it("is not playable while the stream is unsupported", () => {
		streams.value = [stream("a", { isSupported: false })];
		addFavorite(stream("a"));
		expect(resolvedFavorites.value[0].playable).toBe(false);
	});

	it("returns favorites in their stored order", () => {
		["a", "b", "c"].forEach((id) => addFavorite(stream(id)));
		reorderFavorites(["b", "c", "a"]);
		expect(resolvedFavorites.value.map((f) => f.id)).toEqual(["b", "c", "a"]);
	});
});
