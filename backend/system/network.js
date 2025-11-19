// system/network.js
const os = require("os");
const {
	getPersistentData,
	setPersistentData,
	scheduleSavePersistentData,
} = require("../persistence/persistence");

let lastNetSig = "";
let currentNetworkInterface = null;

module.exports.updateNetworkInterfaces = () => {
	const persistentData = getPersistentData();
	const interfaces = os.networkInterfaces();
	const addresses = [];
	for (const name of Object.keys(interfaces)) {
		for (const addr of interfaces[name]) {
			if (addr.family === "IPv4" && addr.address !== "127.0.0.1") {
				addresses.push({ name, address: addr.address });
			}
		}
	}

	const network = {
		interfaces: addresses.map((a) => ({ name: a.name, address: a.address })),
		currentInterface: persistentData.network?.currentInterface || "",
	};

	// Pick a default if current is empty or missing
	if (
		!network.currentInterface ||
		!network.interfaces.find((i) => i.address === network.currentInterface)
	) {
		if (addresses.length > 0) {
			network.currentInterface = addresses[0].address;
		} else {
			network.currentInterface = "";
		}
	}

	const current = network.interfaces.find(
		(i) => i.address === network.currentInterface
	);
	if (current) {
		current.isCurrent = true;
		currentNetworkInterface = { name: current.name, address: current.address };
	} else {
		currentNetworkInterface = null;
	}

	// Update persistent data object
	const newPersistentData = { ...persistentData, network: network };
	setPersistentData(newPersistentData); // Update the global state

	const sig = JSON.stringify(network);
	if (sig !== lastNetSig) {
		lastNetSig = sig;
		scheduleSavePersistentData();
	}
	return {
		interfaces: addresses.map((a) => ({ name: a.name, address: a.address })),
		currentInterface: currentNetworkInterface,
	};
};

module.exports.getCurrentNetworkInterface = () => currentNetworkInterface;
