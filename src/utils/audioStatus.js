// utils/audioStatus.js
//
// Pure: turns the flags main publishes into the labels the audio device page
// shows. The precedence itself is decided in backend/system/audioSelection.js
// and never re-derived here — this only puts words to the answer, so the two
// cannot drift apart.

const REASON_KEYS = {
	system: "audio.reasonSystem",
	pinned: "audio.reasonPinned",
	fallback: "audio.reasonFallback",
	manual: "audio.reasonManual",
	default: "audio.reasonDefault",
	none: "audio.reasonNone",
};

// The sentence above the list: what is in effect, and why.
export const selectionSentence = (selection) => {
	const reason = selection?.reason;
	const key = REASON_KEYS[reason] || REASON_KEYS.none;
	if (key === REASON_KEYS.none) return { key, params: {} };
	return { key, params: { name: selection?.name || "" } };
};

// One row's badges. A preference that cannot take effect because the monitor
// is following the system default is marked as such rather than looking as if
// it were doing something.
export const deviceBadges = (device, followSystem = false) => {
	if (!device) return [];
	const badges = [];
	if (device.absent) {
		badges.push({ key: "audio.absent", variant: "text-bg-warning" });
	} else if (device.isCurrent) {
		badges.push({ key: "audio.inUse", variant: "text-bg-success" });
	}
	if (device.isPinned) {
		badges.push({
			key: "audio.preferred",
			variant: followSystem ? "text-bg-secondary" : "text-bg-warning",
			suffixKey: followSystem ? "audio.ignored" : undefined,
		});
	}
	if (device.isDefaultOutput) {
		badges.push({ key: "audio.systemDefault", variant: "text-bg-secondary" });
	}
	return badges;
};
