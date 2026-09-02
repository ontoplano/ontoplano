/**
 * The switch for a private instance, and the reason it is loud.
 *
 * The failure worth guarding is not somebody being confused about which
 * instance they are on. It is this flag being left set on the real one, where
 * it silently opens registration to the internet — so "anything other than an
 * explicit true is off" has to stay true.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase } from './helpers/db';

// `settings` opens the database when it is imported, so the import has to
// happen after this file has a database of its own — which means importing it
// dynamically, since static imports are hoisted above everything here.
const database = makeDatabase();
afterAll(() => database.remove());

let isStaging: typeof import('../src/lib/server/settings').isStaging;

beforeAll(async () => {
	({ isStaging } = await import('../src/lib/server/settings'));
});

const original = process.env.ONTOPLANO_STAGING;
afterEach(() => {
	if (original === undefined) delete process.env.ONTOPLANO_STAGING;
	else process.env.ONTOPLANO_STAGING = original;
});

describe('isStaging', () => {
	it('is on only for an explicit true', () => {
		process.env.ONTOPLANO_STAGING = 'true';
		expect(isStaging()).toBe(true);
	});

	it('is off when unset, which is the answer with fewer consequences', () => {
		delete process.env.ONTOPLANO_STAGING;
		expect(isStaging()).toBe(false);
	});

	it('is off for every near miss', () => {
		// A deployment that meant to say yes and typed something else gets the
		// closed instance, not the open one.
		for (const value of ['', 'false', '1', 'yes', 'TRUE', 'True', 'staging']) {
			process.env.ONTOPLANO_STAGING = value;
			expect(isStaging(), `ONTOPLANO_STAGING=${value}`).toBe(false);
		}
	});
});

/**
 * And it is a label, so nothing but the label may read it.
 *
 * The rule this pins is the one that was broken: `registrationMode()` returned
 * `open` when the flag was set, so the one instance people are invited to try
 * was the one instance running a branch production never runs. A staging copy
 * that answers a question differently is not standing in for anything.
 *
 * So the flag may be read to *say* which instance this is — the band, the
 * installed icon, the line on the instance page — and nowhere else. The list
 * below is the allowance; adding to it is a decision, and this is where it is
 * made rather than in a diff nobody reads.
 */
describe('who may ask', () => {
	const ALLOWED = [
		// Where it is defined, and the one place it is turned into a name.
		'src/lib/server/settings.ts',
		// Presentation: the band on the page, and the instance page saying so.
		'src/routes/login/+page.server.ts',
		'src/routes/settings/instance/+page.server.ts',
		'src/routes/settings/instance/+page.svelte',
		'src/routes/+layout.server.ts',
		'src/routes/+layout.svelte',
		// The head of every page: the favicon, the apple icon and the name an
		// installed copy takes.
		'src/hooks.server.ts',
		// The installed app's own name and icon, so two of them on one phone are
		// not the same picture.
		'src/routes/manifest.webmanifest/+server.ts'
	];

	it('is consulted only where it decides what something is called', async () => {
		const { readFileSync, readdirSync, statSync } = await import('node:fs');
		const { join, relative } = await import('node:path');

		const root = process.cwd();
		const offenders: string[] = [];

		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) {
					walk(path);
					continue;
				}
				if (!/\.(ts|svelte)$/.test(name) || name.includes('.test.')) continue;
				const where = relative(root, path);
				if (ALLOWED.includes(where)) continue;
				// Comments are stripped first: a doc comment explaining why nothing
				// may branch on this is not a branch on it, and the paragraph in
				// `registration.ts` saying what used to happen must stay readable.
				const code = readFileSync(path, 'utf8')
					.replace(/\/\*[\s\S]*?\*\//g, '')
					.replace(/(^|[^:])\/\/.*$/gm, '$1');
				if (/isStaging|ONTOPLANO_STAGING/.test(code)) offenders.push(where);
			}
		};
		walk(join(root, 'src'));

		expect(offenders, 'staging is a label; these read it as a behaviour').toEqual([]);
	});
});
