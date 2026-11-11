// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useConfigStore } from "../src/stores/config.js";
import { useDiscoveryStore } from "../src/stores/discovery.js";
import { useChannelsStore } from "../src/stores/channels.js";

const stream = (id, extra = {}) => ({
	id,
	name: `Stream ${id}`,
	isSupported: true,
	samplerate: 48000,
	...extra,
});

let config;
let discovery;
let channels;

beforeEach(() => {
	setActivePinia(createPinia());
	config = useConfigStore();
	discovery = useDiscoveryStore();
	channels = useChannelsStore();
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

describe("channel bookkeeping", () => {
	it("stores a reference, never the stream object", () => {
		channels.add(stream("a"));
		expect(config.persistent.favorites).toEqual([{ id: "a", order: 0 }]);
	});

	it("ignores a duplicate and a stream without an id", () => {
		channels.add(stream("a"));
		channels.add(stream("a"));
		channels.add({ name: "no id" });
		expect(channels.count).toBe(1);
	});

	it("renumbers after a removal so order stays contiguous", () => {
		["a", "b", "c"].forEach((id) => channels.add(stream(id)));
		channels.remove("b");
		expect(config.persistent.favorites).toEqual([
			{ id: "a", order: 0 },
			{ id: "c", order: 1 },
		]);
	});

	it("toggles both ways", () => {
		const s = stream("a");
		channels.toggle(s);
		expect(channels.isChannel(s)).toBe(true);
		channels.toggle(s);
		expect(channels.isChannel(s)).toBe(false);
	});
});

describe("reordering", () => {
	beforeEach(() => {
		["a", "b", "c"].forEach((id) => channels.add(stream(id)));
	});

	it("applies the given display order", () => {
		channels.reorder(["c", "a", "b"]);
		expect(config.persistent.favorites).toEqual([
			{ id: "c", order: 0 },
			{ id: "a", order: 1 },
			{ id: "b", order: 2 },
		]);
	});

	it("keeps entries the caller did not mention", () => {
		channels.reorder(["c"]);
		expect(config.persistent.favorites.map((c) => c.id)).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	it("ignores ids that are not channels", () => {
		channels.reorder(["zzz", "b", "a", "c"]);
		expect(config.persistent.favorites.map((c) => c.id)).toEqual([
			"b",
			"a",
			"c",
		]);
	});
});

describe("resolution against live discovery", () => {
	it("joins a channel with the stream currently announced", () => {
		discovery.applyStreams([stream("a", { name: "Regie" })]);
		channels.add(stream("a"));

		const [channel] = channels.resolved;
		expect(channel.online).toBe(true);
		expect(channel.playable).toBe(true);
		expect(channel.name).toBe("Regie");
	});

	// The operator must see that a configured channel is gone, rather than an
	// empty page.
	it("keeps a channel whose stream is absent and marks it offline", () => {
		channels.add(stream("gone"));
		discovery.applyStreams([]);

		const [channel] = channels.resolved;
		expect(channel.online).toBe(false);
		expect(channel.playable).toBe(false);
	});

	it("prefers the stored friendly name over the announced one", () => {
		discovery.applyStreams([stream("a", { name: "AVIO-1234" })]);
		channels.add(stream("a"));
		config.setName("a", "Studio B");

		expect(channels.resolved[0].name).toBe("Studio B");
	});

	it("keeps the name of an offline channel", () => {
		channels.add(stream("a"));
		config.setName("a", "Studio B");
		expect(channels.resolved[0].name).toBe("Studio B");
	});

	it("is not playable while the stream is unsupported", () => {
		discovery.applyStreams([stream("a", { isSupported: false })]);
		channels.add(stream("a"));
		expect(channels.resolved[0].playable).toBe(false);
		expect(channels.resolved[0].unsupported).toBe(true);
	});

	// A stream the output device cannot clock must not offer a play button
	it("is not playable when the output device lacks the sample rate", () => {
		discovery.applyStreams([stream("a", { samplerate: 192000 })]);
		channels.add(stream("a"));
		expect(channels.resolved[0].playable).toBe(false);
	});

	it("returns channels in their stored order", () => {
		["a", "b", "c"].forEach((id) => channels.add(stream(id)));
		channels.reorder(["b", "c", "a"]);
		expect(channels.resolved.map((c) => c.id)).toEqual(["b", "c", "a"]);
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

describe("the persisted key stays `favorites`", () => {
	// The vocabulary moved to "channel" but the stored shape did not, so no
	// migration is needed. A rename here would silently drop every configured
	// channel on the first start after an update.
	it("writes to persistent.favorites, not persistent.channels", () => {
		channels.add(stream("a"));
		expect(config.persistent.favorites).toHaveLength(1);
		expect(config.persistent.channels).toBeUndefined();
	});
});

describe("admin bookkeeping", () => {
	beforeEach(() => {
		["a", "b", "c"].forEach((id) => channels.add(stream(id)));
	});

	it("numbers the rows from one, in display order", () => {
		channels.reorder(["c", "a", "b"]);
		expect(channels.resolved.map((c) => [c.position, c.id])).toEqual([
			[1, "c"],
			[2, "a"],
			[3, "b"],
		]);
	});

	it("moves a channel one step up and one step down", () => {
		channels.move("c", -1);
		expect(channels.resolved.map((c) => c.id)).toEqual(["a", "c", "b"]);
		channels.move("a", 1);
		expect(channels.resolved.map((c) => c.id)).toEqual(["c", "a", "b"]);
	});

	it("refuses to move past either end, and ignores an unknown id", () => {
		channels.move("a", -1);
		channels.move("c", 1);
		channels.move("zzz", 1);
		expect(channels.resolved.map((c) => c.id)).toEqual(["a", "b", "c"]);
	});

	it("counts online and offline channels", () => {
		discovery.applyStreams([stream("a"), stream("b")]);
		expect(channels.onlineCount).toBe(2);
		expect(channels.offlineCount).toBe(1);
	});

	it("reports the source behind the label", () => {
		discovery.applyStreams([
			stream("a", { name: "AVIO-1234", origin: { address: "10.0.0.5" } }),
		]);
		config.setName("a", "Studio B");

		const row = channels.resolved.find((c) => c.id === "a");
		expect(row.name).toBe("Studio B");
		expect(row.hasOwnName).toBe(true);
		expect(row.sourceName).toBe("AVIO-1234");
		expect(row.sender).toBe("10.0.0.5");
	});
});
