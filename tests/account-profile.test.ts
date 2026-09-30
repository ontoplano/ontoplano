/**
 * The name an account goes by, changed from Account.
 *
 * It is the one column of `user` a person edits for themselves, so the thing
 * worth pinning beside the validation is that the statement reaches their own
 * row and nobody else's.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let profile: typeof import('../src/lib/services/account-profile');
let MAX: number;
const ctx = { userId: OWNER, now: new Date('2026-09-29T12:00:00Z'), tz: 'UTC' };

beforeAll(async () => {
	profile = await import('../src/lib/services/account-profile');
	MAX = (await import('../src/lib/display-name')).MAX_DISPLAY_NAME_LENGTH;
});

describe('renameAccount', () => {
	test('changes the name, tidied, and only on the caller’s own row', () => {
		expect(profile.renameAccount(ctx, '  Ana   Maria ')).toBe('Ana Maria');
		expect(profile.profileOf(OWNER)?.name).toBe('Ana Maria');
		expect(profile.profileOf(STRANGER)?.name).toBe('Stranger');
	});

	test('refuses an empty name', () => {
		expect(() => profile.renameAccount(ctx, '   ')).toThrow();
		expect(() => profile.renameAccount(ctx, null)).toThrow();
		expect(profile.profileOf(OWNER)?.name).toBe('Ana Maria');
	});

	test('refuses a name past the limit, and takes one at it', () => {
		expect(() => profile.renameAccount(ctx, 'a'.repeat(MAX + 1))).toThrow();
		expect(profile.renameAccount(ctx, 'a'.repeat(MAX))).toHaveLength(MAX);
	});

	test('an account that does not exist is not found', () => {
		expect(() => profile.renameAccount({ ...ctx, userId: 'nobody' }, 'Ana')).toThrow();
	});
});
