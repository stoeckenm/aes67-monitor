// renderer/store/settings.js
//
// Maps the technical settings onto named choices. The stored shape is
// unchanged, so an admin can still set an exact value.

// Named buffer levels, in packets. "standard" is the previous default.
export const BUFFER_LEVELS = [
	{ key: "low", bufferEnabled: true, bufferSize: 4 },
	{ key: "standard", bufferEnabled: true, bufferSize: 16 },
	{ key: "stable", bufferEnabled: true, bufferSize: 48 },
];

export const bufferLevelOf = (settings) => {
	if (!settings?.bufferEnabled) return "off";
	const match = BUFFER_LEVELS.find((l) => l.bufferSize === settings.bufferSize);
	return match ? match.key : "custom";
};

export const applyBufferLevel = (settings, key) => {
	if (key === "off") {
		settings.bufferEnabled = false;
		return;
	}
	const level = BUFFER_LEVELS.find((l) => l.key === key);
	if (!level) return;
	settings.bufferEnabled = true;
	settings.bufferSize = level.bufferSize;
};

// How many samples the playback worker puts into one write. Mirrors the
// outSampleFactor logic in src/lib/audio.js.
export const samplesPerPacket = (samplerate, ptime) => {
	const rate = Number(samplerate);
	const time = Number(ptime);
	if (!Number.isFinite(rate) || rate <= 0) return 0;
	const effective = Number.isFinite(time) && time > 0 ? time : 1;
	return Math.round((rate / 1000) * effective);
};

export const outSampleFactor = (samplerate, ptime) => {
	const perPacket = samplesPerPacket(samplerate, ptime);
	if (perPacket < 1) return 1;
	let factor = 1;
	while (perPacket * factor < 48) factor++;
	return factor;
};

// The worker raises the jitter buffer for very short packet times, so the
// configured value is not always what is in effect. Shown in the UI so the
// setting does not appear to lie.
export const effectiveBufferSize = (settings, stream) => {
	const configured = settings?.bufferEnabled ? Number(settings.bufferSize) : 0;
	const base = Number.isFinite(configured) && configured > 0 ? configured : 0;
	if (!stream) return base;
	const factor = outSampleFactor(stream.samplerate, stream.ptime);
	return factor > 1 ? Math.max(base, factor) : base;
};

// 0 means "keep streams until they are announced as deleted".
export const DISCOVERY_TIMEOUTS = [
	{ key: "short", seconds: 60 },
	{ key: "default", seconds: 300 },
	{ key: "never", seconds: 0 },
];

export const timeoutKeyOf = (settings) => {
	const seconds = Number(settings?.sdpDeleteTimeout);
	const match = DISCOVERY_TIMEOUTS.find((t) => t.seconds === seconds);
	return match ? match.key : "custom";
};

export const applyTimeoutKey = (settings, key) => {
	const choice = DISCOVERY_TIMEOUTS.find((t) => t.key === key);
	if (!choice) return;
	settings.sdpDeleteTimeout = choice.seconds;
};
