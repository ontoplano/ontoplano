import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Digital Asset Links, which is what removes the URL bar from the Android app.
 *
 * A Trusted Web Activity is Chrome rendering this site inside our own APK. It
 * only drops the address bar once it can prove the two belong together, and the
 * proof is mutual: the APK names this domain, and this file names the APK's
 * signing certificate. Get it wrong and the app still works — it just looks like
 * a browser, which is the single most common TWA complaint.
 *
 * The fingerprints come from the environment because they are a property of the
 * signing keys, which differ between a local debug build and whatever Play
 * signs. `ANDROID_CERT_FINGERPRINTS` is a comma-separated list of SHA-256
 * fingerprints in the usual colon-separated hex form.
 *
 * List both your upload key and Play's app-signing key: Play re-signs uploads,
 * so an app that only trusts the upload key shows the URL bar for every user
 * who installs from the store while working perfectly on the developer's phone.
 */
const DEFAULT_PACKAGE = 'app.ontoplano.twa';

function fingerprints(): string[] {
	return (process.env.ANDROID_CERT_FINGERPRINTS ?? '')
		.split(',')
		.map((f) => f.trim().toUpperCase())
		.filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
}

export const GET: RequestHandler = async () => {
	const certs = fingerprints();

	// An empty statement list is valid JSON and a completely silent failure, so
	// say so instead. Chrome treats a 404 and a malformed file the same way, but
	// a human debugging this gets an answer.
	if (certs.length === 0) {
		return json(
			{
				statements: [],
				note:
					'No ANDROID_CERT_FINGERPRINTS configured. Set it to a comma-separated ' +
					'list of SHA-256 signing fingerprints (AA:BB:...) for the Android app ' +
					'to verify and hide its URL bar.'
			},
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	}

	return json(
		[
			{
				relation: ['delegate_permission/common.handle_all_urls'],
				target: {
					namespace: 'android_app',
					package_name: process.env.ANDROID_PACKAGE_NAME ?? DEFAULT_PACKAGE,
					sha256_cert_fingerprints: certs
				}
			}
		],
		// Chrome caches this; a short TTL keeps a fingerprint fix from taking a
		// day to reach devices.
		{ headers: { 'Cache-Control': 'public, max-age=300' } }
	);
};
