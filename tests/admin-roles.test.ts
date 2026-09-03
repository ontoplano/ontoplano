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

/**
 * Deleting somebody, and the address that has to be typed first.
 *
 * The only action in the app with nothing behind it to restore from: every
 * table the person owns is emptied in one transaction. So the confirmation is
 * not a second click — a click lands where the first one was — but the address
 * of the account being deleted, which is the only thing that catches the
 * mistake actually worth catching: having the wrong account open.
 */
describe('deleteAccountAsAdmin', () => {
	/** A third account, since the two in the fixture are needed by everything else. */
	function makeVictim(email: string): string {
		const id = `to-delete-${email}`;
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Doomed', ?, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
			id,
			email
		);
		return id;
	}

	function exists(id: string): boolean {
		return Boolean(database.get('select id from user where id = ?', id));
	}

	test('refuses a member who is not an administrator', () => {
		const id = makeVictim('a@test.invalid');
		database.exec("update user set role = 'member' where id = ?", STRANGER);
		expect(() => admin.deleteAccountAsAdmin(STRANGER, id, 'a@test.invalid')).toThrow();
		expect(exists(id)).toBe(true);
		database.exec("update user set role = 'admin' where id = ?", STRANGER);
	});

	test('refuses a typed address that is not this account’s', () => {
		const id = makeVictim('b@test.invalid');

		expect(() => admin.deleteAccountAsAdmin(STRANGER, id, 'a@test.invalid')).toThrow(/address/i);
		expect(exists(id), 'the wrong address still deleted the account').toBe(true);
	});

	test('and an empty one', () => {
		const id = makeVictim('c@test.invalid');
		expect(() => admin.deleteAccountAsAdmin(STRANGER, id, '')).toThrow();
		expect(exists(id)).toBe(true);
	});

	test('forgives case and surrounding space, and nothing else', () => {
		const id = makeVictim('d@test.invalid');
		admin.deleteAccountAsAdmin(STRANGER, id, '  D@Test.Invalid ');
		expect(exists(id)).toBe(false);
	});

	test('refuses your own account, whatever you type', () => {
		expect(() => admin.deleteAccountAsAdmin(STRANGER, STRANGER, 'stranger@test.invalid')).toThrow(
			/Settings/i
		);
		expect(exists(STRANGER)).toBe(true);
	});

	test('refuses the account that owns the instance', () => {
		expect(() => admin.deleteAccountAsAdmin(STRANGER, OWNER, 'owner@test.invalid')).toThrow(
			/owns the instance/i
		);
		expect(exists(OWNER)).toBe(true);
	});

	/**
	 * Filed against the administrator, not the account. `audit_events` is one of
	 * the tables the delete empties, so a record written against the person
	 * being deleted would go down with them.
	 */
	test('leaves a record that survives the deletion', () => {
		const id = makeVictim('e@test.invalid');
		admin.deleteAccountAsAdmin(STRANGER, id, 'e@test.invalid');

		const row = database.get(
			"select user_id, detail from audit_events where event = 'account_deleted' order by id desc limit 1"
		) as { user_id: string; detail: string } | undefined;

		expect(row?.user_id).toBe(STRANGER);
		expect(row?.detail).toContain('e@test.invalid');
	});
});
