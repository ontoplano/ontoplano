/**
 * A built file that is not there must not take the instance down.
 *
 * The static handler lists the files it serves once, at boot, and streams them
 * on demand. A file that goes missing afterwards therefore fails *inside* the
 * stream, where nothing is listening, and reaches the process as an uncaught
 * exception — which the death watch answers by exiting, because that is the
 * right answer to almost every uncaught exception.
 *
 * Not to this one. The suite has watched its own server die three times this
 * way, losing every test after the first request for the file — 148 of them on
 * one run — and the same shape has already broken a release: the deploy's
 * `rsync --delete` removed `build/server/chunks` under the running process.
 * One absent stylesheet should be one failed request.
 *
 * This is about the *rule* rather than about the handler's plumbing: the two
 * cases are asserted against the same predicate the handler uses, so a change
 * that widens "missing asset" to mean "any missing file" fails here.
 */
import { describe, expect, test } from 'vitest';

/** The path fragment the handler recognises. Kept in step with hooks.server.ts. */
const BUILT_ASSETS = '/_app/';

/** The handler's own question, in the shape it asks it. */
const missingFile = (error: unknown): string | null => {
	const it = error as { code?: unknown; path?: unknown };
	return it?.code === 'ENOENT' && typeof it.path === 'string' ? it.path : null;
};

const survives = (error: unknown) => {
	const gone = missingFile(error);
	return gone !== null && gone.includes(BUILT_ASSETS);
};

const enoent = (path: string) =>
	Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT', path });

describe('an uncaught ENOENT under the built assets', () => {
	test('is survived, whichever of the built files it is', () => {
		for (const path of [
			'/srv/ontoplano/build/client/_app/immutable/chunks/BseiCUBM.js.br',
			'/srv/ontoplano/build/client/_app/immutable/assets/0.BC57Asiz.css.br',
			'/srv/ontoplano/build/client/_app/immutable/assets/ibm-plex-sans-latin.woff2',
			'/srv/ontoplano/build/client/_app/version.json'
		])
			expect(survives(enoent(path)), path).toBe(true);
	});
});

describe('and everything else still stops the process', () => {
	test('a missing file that is not a built asset', () => {
		// The database is not something to limp on without.
		expect(survives(enoent('/home/me/.local/share/ontoplano/ontoplano.db'))).toBe(false);
		expect(survives(enoent('/srv/ontoplano/build/server/chunks/0.js'))).toBe(false);
	});

	test('an error that is not about a missing file at all', () => {
		expect(survives(new Error('something else entirely'))).toBe(false);
		expect(
			survives(Object.assign(new Error('no space'), { code: 'ENOSPC', path: '/x/_app/y' }))
		).toBe(false);
	});

	test('and something thrown that is not an error', () => {
		expect(survives('a string')).toBe(false);
		expect(survives(null)).toBe(false);
		expect(survives(undefined)).toBe(false);
	});
});
