// system/audioSelection.js
//
// Pure: which output device is in effect and why. Kept free of electron and
// audify imports so the precedence can be tested without a sound card. This is
// the only place that decides it — the renderer reads the answer off the
// published flags instead of deriving the rules a second time.

// Matching is by name plus channel counts, never by id: RtAudio ids shift when
// devices come and go, which is exactly the situation a pinned device has to
// survive.
function sameDevice(a, b) {
	if (!a || !b) return false;
	return (
		a.name === b.name &&
		a.inputChannels === b.inputChannels &&
		a.outputChannels === b.outputChannels
	);
}

// Following the system default beats everything, because it means "I do not
// want to choose". Otherwise a pinned device wins whenever it is present,
// which is the whole point of pinning: unplug the USB headphones and playback
// falls back, plug them in again and they take over without anyone touching
// the UI. A device picked by hand comes next, the system default last.
//
// `reason` is what the UI states in words, so that a selection which cannot
// take effect is never silently ignored:
//   system   — follows the system default
//   pinned   — the preferred device is in use
//   fallback — a preferred device is set but absent, something else is in use
//   manual   — no preference, an explicitly chosen device is in use
//   default  — no preference and no choice, the system default is in use
//   none     — no usable output device at all
function resolveOutput({
	devices = [],
	pinned = null,
	requested = null,
	followSystem = false,
} = {}) {
	const present = (candidate) =>
		(candidate && devices.find((d) => sameDevice(d, candidate))) || null;
	const systemDefault = devices.find((d) => d.isDefaultOutput) || null;

	if (followSystem) {
		return { device: systemDefault, reason: systemDefault ? "system" : "none" };
	}

	const pinnedDevice = present(pinned);
	if (pinnedDevice) return { device: pinnedDevice, reason: "pinned" };

	const requestedDevice = present(requested);
	const device = requestedDevice || systemDefault;
	if (!device) return { device: null, reason: "none" };
	if (pinned) return { device, reason: "fallback" };
	return { device, reason: requestedDevice ? "manual" : "default" };
}

// A pinned device that is not plugged in has to stay in the list: it is the
// only place the preference can be seen and removed, and its absence is
// precisely what someone needs to notice.
function listForRenderer({ devices = [], pinned = null, current = null } = {}) {
	const usable = devices
		.filter((d) => d.inputChannels > 0 || d.outputChannels > 0)
		.map((d) => ({
			...d,
			isCurrent: sameDevice(d, current),
			isPinned: sameDevice(d, pinned),
			absent: false,
		}));

	if (pinned && !usable.some((d) => d.isPinned)) {
		usable.push({
			name: pinned.name,
			inputChannels: pinned.inputChannels || 0,
			outputChannels: pinned.outputChannels || 0,
			sampleRates: [],
			isDefaultOutput: false,
			isDefaultInput: false,
			isCurrent: false,
			isPinned: true,
			absent: true,
		});
	}
	return usable;
}

module.exports = { sameDevice, resolveOutput, listForRenderer };
