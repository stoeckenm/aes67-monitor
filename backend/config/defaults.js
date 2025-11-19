// config/defaults.js

module.exports.persistentDataDefaults = {
	settings: {
		bufferSize: 16,
		bufferEnabled: true,
		hideUnsupported: true,
		sdpDeleteTimeout: 300,
		followSystemAudio: true,
		audioInterface: null,
		storedAudioInterface: null,
	},
	network: { interfaces: [], currentInterface: "" },
	devices: [],
	favorites: [],
};

module.exports.userDataDefaults = {
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
};
