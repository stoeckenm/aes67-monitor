import { describe, it, expect } from "vitest";
import sdpTransform from "sdp-transform";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { preParse, isSupportedStream } = require("../src/lib/sdpParse.js");

const sdp = (lines) => sdpTransform.parse(lines.join("\n") + "\n");

const base = (extra = []) => [
	"v=0",
	"o=- 784066 784066 IN IP4 10.0.100.20",
	"s=Stream",
	"c=IN IP4 239.69.138.112/32",
	"t=0 0",
	...extra,
];

describe("isSupportedStream", () => {
	it("accepts L24 48k stereo", () => {
		const r = isSupportedStream(
			sdp(
				base([
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/2",
					"a=ptime:1",
				]),
			),
		);
		expect(r.isSupported).toBe(true);
	});

	it("accepts L16 and all sample rates named in the standards", () => {
		for (const rate of [44100, 48000, 96000]) {
			const r = isSupportedStream(
				sdp(
					base([
						"m=audio 5004 RTP/AVP 97",
						`a=rtpmap:97 L16/${rate}/8`,
						"a=ptime:1",
					]),
				),
			);
			expect(r.isSupported, `rate ${rate}`).toBe(true);
		}
	});

	// Regression: an announcement with no m= line used to throw a TypeError in
	// preParse and kill the discovery worker.
	it("rejects an announcement without media instead of throwing", () => {
		const r = isSupportedStream(sdp(base()));
		expect(r.isSupported).toBe(false);
		expect(r.unsupportedReason).toBe("Unsupported media type");
	});

	it("rejects non-audio media", () => {
		const r = isSupportedStream(
			sdp(base(["m=video 5004 RTP/AVP 96", "a=rtpmap:96 raw/90000"])),
		);
		expect(r.isSupported).toBe(false);
	});

	it("rejects a media line without an rtpmap", () => {
		const r = isSupportedStream(
			sdp(base(["m=audio 5004 RTP/AVP 97", "a=ptime:1"])),
		);
		expect(r.isSupported).toBe(false);
		expect(r.unsupportedReason).toBe("Unsupported rtpmap");
	});

	it("rejects unsupported sample rates and codecs", () => {
		expect(
			isSupportedStream(
				sdp(
					base([
						"m=audio 5004 RTP/AVP 97",
						"a=rtpmap:97 L24/22050/2",
						"a=ptime:1",
					]),
				),
			).unsupportedReason,
		).toBe("Unsupported samplerate");
		expect(
			isSupportedStream(
				sdp(
					base([
						"m=audio 5004 RTP/AVP 97",
						"a=rtpmap:97 opus/48000/2",
						"a=ptime:1",
					]),
				),
			).unsupportedReason,
		).toBe("Unsupported codec");
	});

	it("rejects more than 64 channels", () => {
		const r = isSupportedStream(
			sdp(
				base([
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/65",
					"a=ptime:1",
				]),
			),
		);
		expect(r.unsupportedReason).toBe("Unsupported channel number");
	});

	// Regression: "L16/48000" without a channel count is valid SDP and means
	// mono. It used to leave channels undefined, which made the playback worker
	// derive a NaN packet size and silently drop every packet.
	it("normalizes a mono rtpmap without a channel count to 1", () => {
		const r = isSupportedStream(
			sdp(
				base(["m=audio 5004 RTP/AVP 97", "a=rtpmap:97 L16/48000", "a=ptime:1"]),
			),
		);
		expect(r.isSupported).toBe(true);
		expect(r.media[0].rtp[0].encoding).toBe(1);
	});

	// Regression: a missing a=ptime is legal and used to make Buffer.alloc throw
	// ERR_OUT_OF_RANGE in the playback worker.
	it("defaults a missing ptime to 1 ms", () => {
		const r = isSupportedStream(
			sdp(base(["m=audio 5004 RTP/AVP 97", "a=rtpmap:97 L24/48000/2"])),
		);
		expect(r.isSupported).toBe(true);
		expect(r.media[0].ptime).toBe(1);
	});

	it("replaces a zero or negative ptime, which would hang the worker", () => {
		for (const bad of ["a=ptime:0", "a=ptime:-1"]) {
			const r = isSupportedStream(
				sdp(base(["m=audio 5004 RTP/AVP 97", "a=rtpmap:97 L24/48000/2", bad])),
			);
			expect(r.media[0].ptime, bad).toBe(1);
		}
	});
});

describe("preParse", () => {
	it("derives multicast, codec and rtpMap from a healthy stream", () => {
		const r = preParse(
			sdp(
				base([
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/2",
					"a=ptime:1",
				]),
			),
		);
		expect(r.mcast).toBe("239.69.138.112");
		expect(r.codec).toBe("L24");
		expect(r.samplerate).toBe(48000);
		expect(r.channels).toBe(2);
		expect(r.ptime).toBe(1);
		expect(r.rtpMap).toBe("L24/48000/2");
	});

	it("prefers the media level connection over the session level one", () => {
		const r = preParse(
			sdp([
				"v=0",
				"o=- 1 1 IN IP4 10.0.0.5",
				"s=Stream",
				"c=IN IP4 239.0.0.1/32",
				"t=0 0",
				"m=audio 5004 RTP/AVP 97",
				"c=IN IP4 239.69.1.9/32",
				"a=rtpmap:97 L24/48000/2",
				"a=ptime:1",
			]),
		);
		expect(r.mcast).toBe("239.69.1.9");
	});

	it("does not throw on an announcement without media", () => {
		expect(() => preParse(sdp(base()))).not.toThrow();
		const r = preParse(sdp(base()));
		expect(r.isSupported).toBe(false);
		expect(r.mcast).toBe("239.69.138.112");
		expect(r.rtpMap).toBe("-");
	});

	it("marks a stream without any connection address unsupported", () => {
		const r = preParse(
			sdp([
				"v=0",
				"o=- 1 1 IN IP4 10.0.0.5",
				"s=Stream",
				"t=0 0",
				"m=audio 5004 RTP/AVP 97",
				"a=rtpmap:97 L24/48000/2",
				"a=ptime:1",
			]),
		);
		expect(r.mcast).toBe("-");
		expect(r.isSupported).toBe(false);
	});

	// Dante flavoured AES67 streams carry a=keywds:Dante, which sdp-transform
	// surfaces as the keywords field.
	it("flags Dante streams via the keywds attribute", () => {
		const r = preParse(
			sdp(
				base([
					"a=keywds:Dante",
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/2",
					"a=ptime:1",
				]),
			),
		);
		expect(r.dante).toBe(true);
	});

	it("does not flag a non-Dante stream", () => {
		const r = preParse(
			sdp(
				base([
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/2",
					"a=ptime:1",
				]),
			),
		);
		expect(r.dante).toBe(false);
	});

	it("falls back to the media description when the session has none", () => {
		const r = preParse(
			sdp(
				base([
					"m=audio 5004 RTP/AVP 97",
					"a=rtpmap:97 L24/48000/2",
					"a=ptime:1",
					"i=Channel 1",
				]),
			),
		);
		expect(r.description).toBe("Channel 1");
	});
});
