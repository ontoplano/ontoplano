/**
 * The operator bootstrap does the whole job itself.
 *
 * The first version of `scripts/make-operator.mjs` only promoted an account
 * that already existed and told you to register it through the app first —
 * which failed on the one box where the script matters, the demo, at
 * midnight, with nothing else to fall back on. A bootstrap that depends on a
 * second door fails exactly when that door is broken, so this one creates
 * the account too, and these tests hold it to that.
 *
 * The script is run the way an operator runs it — a child process with the
 * password on stdin — and the password check is better-auth's own
 * `verifyPassword`, the same function the sign-in endpoint calls.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import { makeDatabase } from './helpers/db';

const db = makeDatabase();
afterAll(() => db.remove());

function run(email: string, stdin?: string) {
	try {
		const out = execFileSync('node', ['scripts/make-operator.mjs', email], {
			env: { ...process.env, DATABASE_URL: db.path },
			input: stdin ?? '',
			encoding: 'utf8'
		});
		return { code: 0, out };
	} catch (e) {
		const err = e as { status: number; stdout: string; stderr: string };
		return { code: err.status, out: `${err.stdout}${err.stderr}` };
	}
}

describe('make-operator', () => {
	it(
		'creates the account it is asked for, ready for the front door',
		{ timeout: 30000 },
		async () => {
			const { code, out } = run('operator@example.test', 'a-long-password\n');
			expect(code).toBe(0);
			expect(out).toContain('is an admin now');

			const user = db.get(
				"select id, role, email_verified as verified from user where email = 'operator@example.test'"
			) as { id: string; role: string; verified: number };
			expect(user.role).toBe('admin');
			expect(user.verified).toBe(1);

			const account = db.get(
				'select provider_id as provider, password from account where user_id = ?',
				user.id
			) as { provider: string; password: string };
			expect(account.provider).toBe('credential');
			// The hash the sign-in endpoint will check, checked by the same code.
			expect(await verifyPassword({ hash: account.password, password: 'a-long-password' })).toBe(
				true
			);
			expect(await verifyPassword({ hash: account.password, password: 'something-else' })).toBe(
				false
			);

			const audit = db.get('select event from audit_events where user_id = ?', user.id) as {
				event: string;
			};
			expect(audit.event).toBe('operator_created');
		}
	);

	it('refuses a short password and makes nothing', { timeout: 30000 }, () => {
		const { code, out } = run('short@example.test', 'tiny\n');
		expect(code).toBe(1);
		expect(out).toContain('at least');
		expect(db.get("select count(*) as n from user where email = 'short@example.test'")).toEqual({
			n: 0
		});
	});

	it(
		'promotes an account that already exists instead of duplicating it',
		{ timeout: 30000 },
		() => {
			db.exec(
				`insert into user (id, name, email, email_verified, created_at, updated_at, role)
			 values ('u-existing', 'someone', 'existing@example.test', 1, 0, 0, 'user')`
			);
			const { code, out } = run('existing@example.test');
			expect(code).toBe(0);
			expect(out).toContain('is an admin now');
			expect(db.get("select role from user where email = 'existing@example.test'")).toEqual({
				role: 'admin'
			});
			expect(
				db.get("select count(*) as n from user where email = 'existing@example.test'")
			).toEqual({
				n: 1
			});
		}
	);

	it('leaves an admin alone', { timeout: 30000 }, () => {
		const { code, out } = run('existing@example.test');
		expect(code).toBe(0);
		expect(out).toContain('already an admin');
	});
});
