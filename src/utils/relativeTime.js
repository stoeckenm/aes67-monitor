// utils/relativeTime.js
//
// Pure: turns a timestamp into the i18n key and parameters the overview shows,
// so the decision can be tested without a clock or a locale. Returns the key
// rather than a string because the renderer owns the translation.

// A timestamp of 0 means "never happened". A timestamp in the future, which a
// clock correction can produce, reads as "just now" rather than a negative age.
export const ageLabel = (timestamp, now = Date.now()) => {
	if (!timestamp) return { key: "overview.lastUpdateNever", params: {} };
	const seconds = Math.floor((now - timestamp) / 1000);
	if (seconds < 5) return { key: "overview.justNow", params: {} };
	if (seconds < 60) {
		return { key: "overview.secondsAgo", params: { count: seconds } };
	}
	return {
		key: "overview.minutesAgo",
		params: { count: Math.floor(seconds / 60) },
	};
};
