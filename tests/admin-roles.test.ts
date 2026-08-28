/**
 * Who may take whose keys away.
 *
 * Two rules that look like politeness and are not: an instance whose last
 * administrator demoted themselves has nobody who can undo it, and demoting the
 * account that owns the instance would appear to work while changing nothing —
 * whoever installed it is an administrator whatever the column says.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let admin: typeof import('../src/lib/server/services/admin');

beforeAll(async () => {
	admin = await import('../src/lib/server/services/admin');
	// The fixture's first account owns the instance; make the other one an
	// administrator so there are two of them to act on each other.
	admin.setRole(OWNER, STRANGER, 'admin');
});

describe('setRole', () => {
	test('an administrator cannot demote themselves', () => {
		expect(() => admin.setRole(STRANGER, STRANGER, 'member')).toThrow(/yourself/i);
		expect(admin.roleOf(STRANGER)).toBe('admin');
	});

	test('nor promote themselves, which is the same rule', () => {
		expect(() => admin.setRole(OWNER, OWNER, 'admin')).toThrow(/yourself/i);
	});

	test('the instance owner cannot be demoted by anybody', () => {
		// It would show a "member" badge on somebody who still has every power.
		expect(() => admin.setRole(STRANGER, OWNER, 'member')).toThrow(/owns the instance/i);
		expect(admin.isAdmin(OWNER)).toBe(true);
	});

	test('an administrator can still demote another one', () => {
		admin.setRole(OWNER, STRANGER, 'member');
		expect(admin.roleOf(STRANGER)).toBe('member');
		admin.setRole(OWNER, STRANGER, 'admin');
	});

	test('an unknown role is refused rather than stored', () => {
		expect(() => admin.setRole(OWNER, STRANGER, 'superuser')).toThrow(/unknown role/i);
	});
});

describe('searchAccounts', () => {
	test('lists administrators first, even when a member joined more recently', () => {
		// The default order is newest first, so the only decisive shape is an
		// administrator who is *older* than a member. Hence the newcomer.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Database = require('better-sqlite3');
		const raw = new Database(database.path);
		raw
			.prepare(
				`insert into user (id, name, email, email_verified, created_at, updated_at)
				 values (?, ?, ?, 0, '2026-06-01T00:00:00', '2026-06-01T00:00:00')`
			)
			.run('newcomer', 'Newcomer', 'newcomer@test.invalid');
		raw.close();

		const accounts = admin.searchAccounts('');
		const roles = accounts.map((a) => a.role);
		expect(roles).toContain('admin');
		expect(roles).toContain('member');
		expect(roles.lastIndexOf('admin')).toBeLessThan(roles.indexOf('member'));

		// And without the rule, the newcomer would have been first.
		expect(accounts[0].id).not.toBe('newcomer');
	});

	test('marks whoever owns the instance', () => {
		const owner = admin.searchAccounts('').find((a) => a.id === OWNER);
		expect(owner?.isOwner).toBe(true);
	});
});
