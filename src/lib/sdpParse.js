// lib/sdpParse.js
//
// Pure parsing and support gating for discovered SDP announcements, split out
// of sdp.js so it can be exercised without opening sockets or timers.

const supportedSampleRates = [16000, 32000, 44100, 48000, 88200, 96000, 192000];

const preParse = function (sdp) {
	//check if valid for playback
	sdp = isSupportedStream(sdp);
	sdp.dante = sdp.keywords == "Dante";

	// A malformed announcement can lack m= lines entirely, so every media[0]
	// access below has to tolerate an empty media array.
	const firstMedia = sdp.media?.[0];

	//get multicast from connection
	if (firstMedia?.connection?.ip) {
		sdp.mcast = firstMedia.connection.ip.split("/")[0];
	} else if (sdp.connection && sdp.connection.ip) {
		sdp.mcast = sdp.connection.ip.split("/")[0];
	} else {
		sdp.mcast = "-";
		sdp.isSupported = false;
	}

	sdp.description = sdp.description ? sdp.description : "-";
	if (sdp.description == "-" && firstMedia?.description) {
		sdp.description = firstMedia.description;
	}

	if (sdp.isSupported) {
		sdp.codec = firstMedia.rtp[0].codec;
		sdp.samplerate = firstMedia.rtp[0].rate;
		sdp.channels = firstMedia.rtp[0].encoding;
		sdp.ptime = firstMedia.ptime;
		sdp.rtpMap = sdp.codec + "/" + sdp.samplerate + "/" + sdp.channels;
	} else {
		sdp.rtpMap = "-";
	}

	return sdp;
};

const isSupportedStream = function (sdp) {
	if (!Array.isArray(sdp.media) || sdp.media.length <= 0) {
		sdp.isSupported = false;
		sdp.unsupportedReason = "Unsupported media type";
		return sdp;
	}

	for (let i = 0; i < sdp.media.length; i++) {
		const media = sdp.media[i];

		if (media.type != "audio" || media.protocol != "RTP/AVP") {
			sdp.isSupported = false;
			sdp.unsupportedReason = "Unsupported media type";
			return sdp;
		}

		// A m= line without any a=rtpmap leaves rtp undefined
		if (!Array.isArray(media.rtp) || media.rtp.length != 1) {
			sdp.isSupported = false;
			sdp.unsupportedReason = "Unsupported rtpmap";
			return sdp;
		}

		if (supportedSampleRates.indexOf(media.rtp[0].rate) === -1) {
			sdp.isSupported = false;
			sdp.unsupportedReason = "Unsupported samplerate";
			return sdp;
		}

		if (media.rtp[0].codec != "L24" && media.rtp[0].codec != "L16") {
			sdp.isSupported = false;
			sdp.unsupportedReason = "Unsupported codec";
			return sdp;
		}

		// "L16/48000" without a channel count is valid SDP and means mono.
		// Normalizing here keeps the playback worker from deriving NaN sizes.
		if (media.rtp[0].encoding === undefined || media.rtp[0].encoding === "") {
			media.rtp[0].encoding = 1;
		}

		const channels = Number(media.rtp[0].encoding);
		if (!Number.isInteger(channels) || channels < 1 || channels > 64) {
			sdp.isSupported = false;
			sdp.unsupportedReason = "Unsupported channel number";
			return sdp;
		}
		media.rtp[0].encoding = channels;

		// ptime is optional per RFC 4566; AES67 streams without it are played
		// at the 1 ms default rather than dropped.
		const ptime = Number(media.ptime);
		if (!Number.isFinite(ptime) || ptime <= 0) {
			media.ptime = 1;
		}
	}

	sdp.isSupported = true;
	return sdp;
};

module.exports = { preParse, isSupportedStream, supportedSampleRates };
