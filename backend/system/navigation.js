// system/navigation.js
//
// Pure URL predicate behind the window and navigation guards in main.js. Kept
// free of electron imports so it can be tested directly: an answer that is too
// strict blanks the window, one that is too loose lets a crafted announcement
// navigate the renderer off its own bundle.

// The renderer only ever shows this app's own bundle: `devServerUrl` while Vite
// serves it in development, `distUrl` (the file:// URL of the packaged bundle's
// directory) once packaged. Scheme and host have to match and the path has to
// sit at or below the base, so a sibling directory such as .../distother and a
// scheme such as javascript: or about: are both refused.
function isUrlWithinApp(url, { packaged, devServerUrl, distUrl } = {}) {
	const base = packaged ? distUrl : devServerUrl;
	if (typeof url !== "string" || typeof base !== "string") return false;

	let target;
	let root;
	try {
		target = new URL(url);
		root = new URL(base);
	} catch {
		return false;
	}

	if (target.protocol !== root.protocol) return false;
	// file: URLs carry no host, so there the path prefix is what scopes them.
	if (target.host !== root.host) return false;
	if (target.pathname === root.pathname) return true;

	const rootPath = root.pathname.endsWith("/")
		? root.pathname
		: root.pathname + "/";
	return target.pathname.startsWith(rootPath);
}

module.exports = { isUrlWithinApp };
