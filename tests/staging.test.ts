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
