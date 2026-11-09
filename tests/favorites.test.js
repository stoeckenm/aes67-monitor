// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "../src/stores/config.js";
import { useDiscoveryStore } from "../src/stores/discovery.js";
import { useFavoritesStore } from "../src/stores/favorites.js";

const stream = (id, extra = {}) => ({
	id,
	name: `Stream ${id}`,
	isSupported: true,
	samplerate: 48000,
	...extra,
});

let config;
let discovery;
let favorites;

beforeEach(() => {
	setActivePinia(createPinia());
	config = useConfigStore();
	discovery = useDiscoveryStore();
	favorites = useFavoritesStore();
	// The current output device decides what counts as playable
	discovery.audioDevices = [
		{
			name: "Speakers",
			inputChannels: 0,
			outputChannels: 2,
			isCurrent: true,
			sampleRates: [44100, 48000, 96000],
		},
	];
});

describe("favorite bookkeeping", () => {
	it("stores a reference, never the stream object", () => {
		favorites.add(stream("a"));
		expect(config.persistent.favorites).toEqual([{ id: "a", order: 0 }]);
	});

	it("ignores a duplicate and a stream without an id", () => {
		favorites.add(stream("a"));
		favorites.add(stream("a"));
		favorites.add({ name: "no id" });
		expect(favorites.count).toBe(1);
	});

	it("renumbers after a removal so order stays contiguous", () => {
		["a", "b", "c"].forEach((id) => favorites.add(stream(id)));
		favorites.remove("b");
		expect(config.persistent.favorites).toEqual([
			{ id: "a", order: 0 },
			{ id: "c", order: 1 },
		]);
	});

	it("toggles both ways", () => {
		const s = stream("a");
		favorites.toggle(s);
		expect(favorites.isFavorite(s)).toBe(true);
		favorites.toggle(s);
		expect(favorites.isFavorite(s)).toBe(false);
	});
});

describe("reordering", () => {
	beforeEach(() => {
		["a", "b", "c"].forEach((id) => favorites.add(stream(id)));
	});

	it("applies the given display order", () => {
		favorites.reorder(["c", "a", "b"]);
		expect(config.persistent.favorites).toEqual([
			{ id: "c", order: 0 },
			{ id: "a", order: 1 },
			{ id: "b", order: 2 },
		]);
	});

	it("keeps entries the caller did not mention", () => {
		favorites.reorder(["c"]);
		expect(config.persistent.favorites.map((f) => f.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("ignores ids that are not favorites", () => {
		favorites.reorder(["zzz", "b", "a", "c"]);
		expect(config.persistent.favorites.map((f) => f.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});
});

describe("resolution against live discovery", () => {
	it("joins a favorite with the stream currently announced", () => {
		discovery.applyStreams([stream("a", { name: "Regie" })]);
		favorites.add(stream("a"));

		const [favorite] = favorites.resolved;
		expect(favorite.online).toBe(true);
		expect(favorite.playable).toBe(true);
		expect(favorite.name).toBe("Regie");
	});

	// The operator must see that a configured channel is gone, rather than an
	// empty page.
	it("keeps a favorite whose stream is absent and marks it offline", () => {
		favorites.add(stream("gone"));
		discovery.applyStreams([]);

		const [favorite] = favorites.resolved;
		expect(favorite.online).toBe(false);
		expect(favorite.playable).toBe(false);
	});

	it("prefers the stored friendly name over the announced one", () => {
		discovery.applyStreams([stream("a", { name: "AVIO-1234" })]);
		favorites.add(stream("a"));
		config.setName("a", "Studio B");

		expect(favorites.resolved[0].name).toBe("Studio B");
	});

	it("keeps the name of an offline favorite", () => {
		favorites.add(stream("a"));
		config.setName("a", "Studio B");
		expect(favorites.resolved[0].name).toBe("Studio B");
	});

	it("is not playable while the stream is unsupported", () => {
		discovery.applyStreams([stream("a", { isSupported: false })]);
		favorites.add(stream("a"));
		expect(favorites.resolved[0].playable).toBe(false);
		expect(favorites.resolved[0].unsupported).toBe(true);
	});

	// A stream the output device cannot clock must not offer a play button
	it("is not playable when the output device lacks the sample rate", () => {
		discovery.applyStreams([stream("a", { samplerate: 192000 })]);
		favorites.add(stream("a"));
		expect(favorites.resolved[0].playable).toBe(false);
	});

	it("returns favorites in their stored order", () => {
		["a", "b", "c"].forEach((id) => favorites.add(stream(id)));
		favorites.reorder(["b", "c", "a"]);
		expect(favorites.resolved.map((f) => f.id)).toEqual(["b", "c", "a"]);
	});
});

describe("stream identity across discovery updates", () => {
	// Regression: replacing the array discarded object identities, so a
	// reference held elsewhere pointed at a stale copy.
	it("updates streams in place instead of replacing them", () => {
		discovery.applyStreams([stream("a", { name: "First" })]);
		const first = discovery.streamById("a");

		discovery.applyStreams([stream("a", { name: "Renamed" })]);
		expect(discovery.streamById("a")).toBe(first);
		expect(first.name).toBe("Renamed");
	});

	it("forgets streams that stopped being announced", () => {
		discovery.applyStreams([stream("a"), stream("b")]);
		discovery.applyStreams([stream("a")]);
		expect(discovery.streamById("b")).toBeNull();
		expect(discovery.streams).toHaveLength(1);
	});
});
