/**
 * Who has been using this instance.
 *
 * Every signed-in request stamps the account, at most once per
 * `ACTIVE_STAMP_EVERY_MS` — a page that makes twenty requests must not be
 * twenty writes — and the admin page reads the stamp back. The stamp moves
 * `last_active_at` and nothing else: `updated_at` says when the account itself
 * last changed.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let activity: typeof import('../src/lib/server/activity');
let admin: typeof import('../src/lib/server/services/admin');

beforeAll(async () => {
	activity = await import('../src/lib/server/activity');
	admin = await import('../src/lib/server/services/admin');
});

const listed = (id: string) => admin.searchAccounts('').find((a) => a.id === id)!;

/** The account row's own `updated_at`, read past the service, which does not expose it. */
function updatedAt(id: string): number {
	const raw = new Database(database.path, { readonly: true });
	try {
		return (
			raw.prepare('select updated_at from user where id = ?').get(id) as { updated_at: number }
		).updated_at;
	} finally {
		raw.close();
	}
}

describe('the last-active stamp', () => {
	test('an account nobody has seen yet says so', () => {
		expect(listed(STRANGER).lastActiveAt).toBeNull();
	});

	test('a request stamps it, and the admin page reads it back', () => {
		const at = Date.parse('2026-10-12T09:00:00Z');
		const before = updatedAt(OWNER);
		expect(activity.stampActive(OWNER, at)).toBe(true);
		expect(listed(OWNER).lastActiveAt).toBe('2026-10-12T09:00:00.000Z');
		expect(admin.accountById(OWNER).lastActiveAt).toBe('2026-10-12T09:00:00.000Z');
		// The account itself did not change.
		expect(updatedAt(OWNER)).toBe(before);
	});

	test('requests inside the window do not write again', () => {
		const at = Date.parse('2026-10-12T10:00:00Z');
		expect(activity.stampActive(OWNER, at)).toBe(true);
		expect(activity.stampActive(OWNER, at + activity.ACTIVE_STAMP_EVERY_MS - 1)).toBe(false);
		expect(listed(OWNER).lastActiveAt).toBe('2026-10-12T10:00:00.000Z');

		const later = at + activity.ACTIVE_STAMP_EVERY_MS;
		expect(activity.stampActive(OWNER, later)).toBe(true);
		expect(listed(OWNER).lastActiveAt).toBe(new Date(later).toISOString());
	});

	test('one account’s request stamps only that account', () => {
		expect(listed(STRANGER).lastActiveAt).toBeNull();
	});
});
