import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
	{
		ignores: ["dist/**", "release-builds/**", "node_modules/**"],
	},
	js.configs.recommended,
	...pluginVue.configs["flat/essential"],
	{
		// Electron main process, preload and the forked workers: CommonJS on Node
		files: ["main.js", "preload.js", "backend/**/*.js", "src/lib/**/*.js"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "commonjs",
			globals: { ...globals.node },
		},
	},
	{
		// Renderer: ES modules in the browser
		files: ["src/**/*.{js,vue}"],
		ignores: ["src/lib/**"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.browser },
		},
	},
	{
		// Build config runs on Node as an ES module
		files: ["*.config.mjs"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.node },
		},
	},
	{
		// Tests run on Node, but the component tests use the jsdom environment
		files: ["tests/**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.node, ...globals.browser },
		},
	},
];
