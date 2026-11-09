import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";

import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./assets/style.css";

// Bootstrap 5.3 reads its colour tokens from this attribute. Done here rather
// than as an inline script in index.html, which the packaged app's CSP
// (script-src 'self') would block. The window is only shown on
// ready-to-show, so there is no flash of the wrong theme.
const applyColourScheme = () => {
	try {
		const dark = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = (on) =>
			document.documentElement.setAttribute(
				"data-bs-theme",
				on ? "dark" : "light",
			);
		apply(dark.matches);
		dark.addEventListener("change", (event) => apply(event.matches));
	} catch {
		document.documentElement.setAttribute("data-bs-theme", "light");
	}
};

applyColourScheme();

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.mount("#app");
