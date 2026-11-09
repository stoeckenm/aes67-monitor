const { RtAudio, RtAudioFormat } = require("audify");
const dgram = require("dgram");

let rtAudio;
let client;
let streamOpen = false;
let argsCache;

// Report a playback failure to the main process instead of dying. A thrown
// error here would kill the forked worker and leave the app mute until restart.
const reportError = function (reason, err) {
	if (err) console.error(`[AUDIO] ${reason}`, err);
	else console.error(`[AUDIO] ${reason}`);
	try {
		process.send({ type: "error", data: reason });
	} catch (sendErr) {
		console.error("[AUDIO] Could not report error to main", sendErr);
	}
};

// ptime and channel count come from a network announcement, so they may be
// missing or nonsense. An invalid samplesPerPacket of 0 would spin the
// outSampleFactor loop below forever, and NaN would throw in Buffer.alloc.
const resolveFormat = function (args) {
	const samplerate = Number(args.samplerate);
	const channels = Number(args.channels);
	const ptime = Number(args.ptime);

	if (!Number.isFinite(samplerate) || samplerate <= 0) {
		return { error: `Invalid sample rate: ${args.samplerate}` };
	}
	if (!Number.isInteger(channels) || channels < 1 || channels > 64) {
		return { error: `Invalid channel count: ${args.channels}` };
	}
	// ptime is optional per RFC 4566; AES67 defaults to 1 ms packets
	const effectivePtime = Number.isFinite(ptime) && ptime > 0 ? ptime : 1;
	const samplesPerPacket = Math.round((samplerate / 1000) * effectivePtime);

	if (!Number.isFinite(samplesPerPacket) || samplesPerPacket < 1) {
		return {
			error: `Invalid packet time: ${args.ptime} at ${samplerate} Hz`,
		};
	}

	// A stale favorite can carry a channel mapping wider than the stream it is
	// replayed against; an out-of-range read would throw inside the UDP handler.
	const clamp = (value) => {
		const index = Number(value);
		if (!Number.isInteger(index) || index < 0) return 0;
		return Math.min(index, channels - 1);
	};

	return {
		samplerate,
		channels,
		samplesPerPacket,
		ch1Map: clamp(args.ch1Map),
		ch2Map: clamp(args.ch2Map),
	};
};

const closeStream = function () {
	if (client) {
		try {
			client.close();
		} catch (err) {
			console.error("[AUDIO] Error closing socket", err);
		}
		client = null;
	}
	if (rtAudio) {
		try {
			rtAudio.stop();
			rtAudio.clearOutputQueue();
			rtAudio.closeStream();
		} catch (err) {
			console.error("[AUDIO] Error closing audio stream", err);
		}
		rtAudio = null;
	}
	streamOpen = false;
};

const start = function (args) {
	argsCache = args;
	closeStream();

	const format = resolveFormat(args);
	if (format.error) {
		reportError(format.error);
		return;
	}
	const { samplerate, channels, samplesPerPacket, ch1Map, ch2Map } = format;

	client = dgram.createSocket({ type: "udp4", reuseAddr: true });

	// Error handling
	client.on("error", (err) => {
		console.error(`Socket error: ${err.stack}`);
	});

	client.on("listening", function () {
		try {
			client.addMembership(args.mcast, args.networkInterface);
		} catch (err) {
			reportError(`Could not join multicast group ${args.mcast}`, err);
		}
	});

	// Constants
	const bufferSize = 1024;
	const bytesPerSample = args.codec == "L24" ? 3 : 2;
	// RFC 4570 allows a space separated src-list; sdp-transform hands it over
	// as one string, so a plain equality check would reject every packet.
	const filterAddrs = args.filter
		? String(args.filterAddr).trim().split(/\s+/).filter(Boolean)
		: [];
	const pcmDataSize = samplesPerPacket * bytesPerSample * channels;
	const pcmL16out = Buffer.alloc(samplesPerPacket * 4 * bufferSize);

	let jitterBufferSize = args.jitterBufferEnabled ? args.jitterBufferSize : 0;
	let outSampleFactor = 1;
	let seqInternal = -1;

	// Play it safe and write 48 samples at minimum
	while (samplesPerPacket * outSampleFactor < 48) {
		outSampleFactor++;
	}

	console.log("Output sample factor:", outSampleFactor);

	if (outSampleFactor > 1 && outSampleFactor > jitterBufferSize) {
		jitterBufferSize = outSampleFactor;
		console.log("Increasing jitter buffer size", jitterBufferSize);
	}

	client.on("message", function (buffer, remote) {
		const firstByte = buffer.readUInt8(0);
		const csrcCount = firstByte & 0x0f;
		let headerLength = 12 + csrcCount * 4;
		const extensionFlag = (firstByte >> 4) & 0x01;

		if (extensionFlag) {
			let extIndex = 12 + csrcCount * 4;
			const extensionLength = buffer.readUInt16BE(extIndex + 2);
			headerLength += 4 + extensionLength * 4;
		}

		if (
			buffer.length != pcmDataSize + headerLength ||
			(filterAddrs.length > 0 && !filterAddrs.includes(remote.address))
		) {
			return;
		}

		let seqNum = buffer.readUInt16BE(2);
		let bufferIndex = (seqNum % bufferSize) * samplesPerPacket * 4;

		for (let sample = 0; sample < samplesPerPacket; sample++) {
			pcmL16out.writeUInt16LE(
				buffer.readUInt16BE(
					(sample * channels + ch1Map) * bytesPerSample + headerLength,
				),
				sample * 4 + bufferIndex,
			);
			pcmL16out.writeUInt16LE(
				buffer.readUInt16BE(
					(sample * channels + ch2Map) * bytesPerSample + headerLength,
				),
				sample * 4 + bufferIndex + 2,
			);
		}

		if (seqInternal != -1) {
			if (outSampleFactor == 1 || seqInternal % outSampleFactor == 0) {
				let bufferIndex = seqInternal * samplesPerPacket * 4;
				let outBuf = pcmL16out.subarray(
					bufferIndex,
					bufferIndex + samplesPerPacket * 4 * outSampleFactor,
				);
				// One output packet per received packet, so the sender paces
				// playback and the queue stays level on its own. Backpressure
				// cannot be measured here: audify exposes no queue depth, and
				// getStreamLatency() reports the device's fixed latency rather
				// than what is pending. Correcting long term drift between the
				// sender clock and the device clock would need resampling, which
				// this worker does not do.
				//
				// The output device can also disappear mid-stream, and an
				// unguarded throw in this handler would take the worker down.
				try {
					rtAudio.write(outBuf);
				} catch (error) {
					reportError("Lost audio output device during playback", error);
					closeStream();
					return;
				}
			}
			seqInternal = (seqInternal + 1) % bufferSize;
		} else {
			// Modulo of a negative value yields a negative index in JS, which
			// would make subarray() read from the end of the ring buffer.
			seqInternal =
				(((seqNum - jitterBufferSize) % bufferSize) + bufferSize) % bufferSize;

			for (var j = 0; j < jitterBufferSize; j++) {
				try {
					rtAudio.write(Buffer.alloc(samplesPerPacket * 4 * outSampleFactor));
				} catch (error) {
					console.error("Error writing sample:", error);
				}
			}
		}
	});

	try {
		rtAudio = new RtAudio(args.audioAPI);
	} catch (error) {
		reportError("Could not initialize the audio system", error);
		closeStream();
		return;
	}

	const devices = rtAudio.getDevices();
	const selected = args.selected || {};
	// Match on name plus channel counts, never on id: RtAudio ids are not
	// stable across device changes.
	let device = devices.find(
		(d) =>
			d.name == selected.name &&
			d.inputChannels == selected.inputChannels &&
			d.outputChannels == selected.outputChannels,
	);

	if (device) {
		console.log("Found device: " + device.name);
	} else {
		// Fall back through default output, then any usable output, instead of
		// dereferencing an undefined device.
		device =
			devices.find((d) => d.isDefaultOutput && d.outputChannels >= 2) ||
			devices.find((d) => d.outputChannels >= 2);
		if (!device) {
			reportError("No audio output device with at least two channels found");
			closeStream();
			return;
		}
		console.log("Falling back to output device: " + device.name);
	}

	try {
		rtAudio.openStream(
			{ deviceId: device.id, nChannels: 2, firstChannel: 0 },
			null,
			RtAudioFormat.RTAUDIO_SINT16,
			samplerate,
			samplesPerPacket * outSampleFactor,
			"AES67 Monitor",
		);
		rtAudio.start();
		client.bind(args.port);
		streamOpen = true;
	} catch (error) {
		reportError(`Could not open audio output "${device.name}"`, error);
		closeStream();
	}
};

const restart = (args) => {
	if (streamOpen) {
		argsCache = Object.assign({}, argsCache, args);
		start(argsCache);
	}
};

const stop = function () {
	closeStream();
};

process.on("message", (message) => {
	switch (message.type) {
		case "start":
			start(message.data);
			break;
		case "restart":
			restart(message.data);
			break;
		case "stop":
			stop();
			break;
	}
});

process.on("disconnect", () => {
	process.exit(0);
});
