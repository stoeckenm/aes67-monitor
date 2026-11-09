// i18n/index.js
import { createI18n } from "vue-i18n";
import de from "../locales/de.json";
import en from "../locales/en.json";

// German is the default; the English catalogue is complete and kept in step so
// a second language needs no component changes.
export const i18n = createI18n({
	legacy: false,
	locale: "de",
	fallbackLocale: "en",
	messages: { de, en },
});
