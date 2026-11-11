// utils/theme.js
//
// The colour scheme. Kept apart from the components because the decision is
// pure and worth testing: getting it wrong leaves the window in the wrong
// theme, which on a kiosk machine nobody is there to correct.

export const THEME_CHOICES = ["system", "light", "dark"];

// "system" follows the OS, anything else is taken literally. An unknown or
// missing value follows the OS rather than guessing light, so a config written
// by a newer version cannot pin an old build to the wrong scheme.
export const resolveTheme = (choice, systemPrefersDark = false) => {
	if (choice === "light") return "light";
	if (choice === "dark") return "dark";
	return systemPrefersDark ? "dark" : "light";
};

const systemPrefersDark = () => {
	try {
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	} catch {
		return false;
	}
};

// Bootstrap 5.3 reads its colour tokens from this attribute.
export const applyTheme = (choice) => {
	const theme = resolveTheme(choice, systemPrefersDark());
	document.documentElement.setAttribute("data-bs-theme", theme);
	return theme;
};

// Re-applies on an OS change, which only matters while the choice is "system".
export const watchSystemScheme = (onChange) => {
	try {
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => onChange();
		query.addEventListener("change", handler);
		return () => query.removeEventListener("change", handler);
	} catch {
		return () => {};
	}
};
