import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The file that says which Android app owns this domain has to name a real one.
 *
 * `/.well-known/assetlinks.json` is how Android decides that the app opening a
 * link is the app the site vouches for. Name a package nobody builds and the
 * check simply fails — the app still runs, it just runs looking like a browser,
 * with a URL bar over it.
 *
 * It named `app.ontoplano.twa` for months after the Trusted Web Activity that
 * owned that id was retired, because the name lived in three places — this
 * route's default, a variable in `defaults.env` that nothing read, and the
 * flavour table that actually builds the app — and only the third was kept up
 * to date. This pins the first two to the third.
 */
const flavours = readFileSync('scripts/android-flavours.mjs', 'utf8');
const route = readFileSync('src/routes/.well-known/assetlinks.json/+server.ts', 'utf8');

/** The id of the flavour that goes to a store, out of the table that builds it. */
function officialId(): string {
	const table = flavours.match(/key: 'official',\s*\n\s*id: '([^']+)'/);
	if (!table) throw new Error('scripts/android-flavours.mjs no longer has an official flavour');
	return table[1];
}

describe('the app the domain vouches for', () => {
	it('is the one the official flavour builds', () => {
		const named = route.match(/const DEFAULT_PACKAGE = '([^']+)'/)?.[1];
		expect(named, 'assetlinks names a package').toBeTruthy();
		expect(named).toBe(officialId());
	});

	it('is not the retired Trusted Web Activity', () => {
		// Kept as its own case: the id is gone from the build but the app is
		// still listed under it on Play, so it is the one wrong answer somebody
		// is most likely to put back. The value, not the word — the route's own
		// comment says what it used to be, which is worth keeping.
		expect(route).not.toMatch(/=\s*'app\.ontoplano\.twa'/);
		expect(readFileSync('defaults.env', 'utf8')).not.toMatch(/=\s*app\.ontoplano\.twa/);
	});
});
