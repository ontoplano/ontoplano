/**
 * Who an Android build says it is, decided from the instance it points at.
 *
 * Split out of `build-twa.mjs` so it can be tested without a JDK, an Android
 * SDK and a network: everything here is a pure function of a hostname and a web
 * manifest.
 *
 * The rule both halves follow is the same one: the instance already answers
 * "what am I called and what do I look like" — for the browser, in its
 * manifest — and the Android build asks that question rather than keeping a
 * second list of answers that would drift.
 */

/** The one instance that keeps the plain name. Everything else is a copy. */
export const PRODUCTION_HOST = 'app.ontoplano.com';

/**
 * The package-name suffix for a host, or '' for production.
 *
 * Android identifies an app by its package: a second APK with the same package
 * *replaces* the first, whatever origin it was built against. So staging gets
 * `…twa.staging` and installs beside the real one, which is the whole point of
 * having a staging instance you can carry around.
 *
 * A package segment may not start with a digit, so a LAN build — an IP address
 * — is called `local` rather than something Android refuses outright.
 */
/** @param {string} host @returns {string} */
export function suffixFor(host) {
	if (host === PRODUCTION_HOST) return '';
	const label = String(host)
		.split(/[.:]/)[0]
		.replace(/[^a-z0-9]/gi, '')
		.toLowerCase();
	return !label || /^\d/.test(label) ? 'local' : label;
}

/** @param {string} host @param {string} [explicit] @returns {string} */
export function packageIdFor(host, explicit) {
	if (explicit) return explicit;
	const suffix = suffixFor(host);
	return suffix ? `app.ontoplano.twa.${suffix}` : 'app.ontoplano.twa';
}

/**
 * What to fall back to when the instance cannot be asked.
 *
 * @param {string} assetOrigin
 */
export function defaultIdentity(assetOrigin) {
	return {
		name: 'Ontoplano',
		launcherName: 'Ontoplano',
		iconUrl: `${assetOrigin}/icons/icon-512.png`,
		maskableIconUrl: `${assetOrigin}/icons/icon-maskable-512.png`
	};
}

/**
 * The name and icons an instance's own manifest asks for.
 *
 * `short_name` is the launcher label because Android truncates it at about a
 * dozen characters — "Ontoplano staging" becomes "Ontoplano s…" and the two
 * apps look identical again, which is the failure this exists to avoid.
 *
 * @param {{ name?: string, short_name?: string, icons?: { src?: string, sizes?: string, purpose?: string }[] } | null | undefined} manifest
 * @param {string} assetOrigin
 */
export function identityFrom(manifest, assetOrigin) {
	const fallback = defaultIdentity(assetOrigin);
	if (!manifest || typeof manifest !== 'object') return fallback;

	/** @param {string} purpose @param {number} size */
	const icon = (purpose, size) =>
		manifest.icons?.find(
			(/** @type {{ purpose?: string, sizes?: string }} */ i) =>
				i.purpose === purpose && i.sizes === `${size}x${size}`
		)?.src;
	const any = icon('any', 512);
	const maskable = icon('maskable', 512);

	return {
		name: manifest.name || fallback.name,
		launcherName: manifest.short_name || manifest.name || fallback.launcherName,
		iconUrl: any ? new URL(any, assetOrigin).href : fallback.iconUrl,
		maskableIconUrl: maskable ? new URL(maskable, assetOrigin).href : fallback.maskableIconUrl
	};
}
