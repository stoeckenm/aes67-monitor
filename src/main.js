import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";
import { applyTheme } from "./utils/theme";

import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./assets/style.css";

// The OS preference is applied before the first paint. The stored choice
// cannot be read yet — that needs the config from main — so App.vue takes over
// as soon as it has it. The window is only shown on ready-to-show, so there is
// no flash of the wrong theme either way.
applyTheme("system");

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.mount("#app");
