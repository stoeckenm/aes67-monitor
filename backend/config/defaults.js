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
	// Keyed by device IP address: { "10.0.0.5": { name, description } }
	devices: {},
	favorites: [],
	// Friendly names keyed by stream id, kept out of the live stream objects
	// because those are replaced wholesale on every discovery update.
	streamNames: {},
	passwordHash: null,
};

module.exports.userDataDefaults = {
	settings: {
		sidebarCollapsed: false,
		window: { width: 1280, height: 800, x: null, y: null, maximized: true },
		favoritesOrder: [],
	},
};
