import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue()],
	// Relative paths: the packaged app loads dist/index.html over file://
	base: "./",
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		// Matches the URL main.js opens in development
		port: 8888,
		strictPort: true,
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
	test: {
		environment: "node",
		include: ["tests/**/*.test.js"],
	},
});
