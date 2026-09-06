/**
 * The log tells a confirmed address from a hopeful one.
 *
 * Every account's history began and ended with "registered": an
 * administrator reading /admin could not tell somebody who clicked the
 * confirmation link from a typo that never will. Verification writes its
 * own line now, through better-auth's own verify flow — this drives a real
 * token through auth.api.verifyEmail rather than calling record() directly,
 * so the wiring in auth.ts is what is being tested.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase } from './helpers/db';

const database = makeDatabase();
afterAll(() => database.remove());

let auth: typeof import('../src/lib/server/auth');

beforeAll(async () => {
	auth = await import('../src/lib/server/auth');
});

test('clicking the confirmation link lands in the account log', async () => {
	database.exec(
		`insert into user (id, name, email, email_verified, created_at, updated_at)
		 values ('u-unverified', 'hopeful', 'hopeful@example.test', 0, 0, 0)`
	);

	const { url } = await auth.sendVerificationFor('hopeful@example.test');
	const token = new URL(url).searchParams.get('token');
	expect(token).toBeTruthy();

	// Outside a real request, the sveltekit cookie plugin's after-hook throws
	// on getRequestEvent — after verification and the audit write have run.
	// Tolerated: what this test asserts is the state the endpoint left behind.
	await auth.auth.api
		.verifyEmail({ query: { token: token! }, headers: new Headers() })
		.catch(() => {});

	const verified = database.get(
		"select email_verified as v from user where id = 'u-unverified'"
	) as { v: number };
	expect(verified.v).toBe(1);

	const row = database.get(
		"select event from audit_events where user_id = 'u-unverified' and event = 'email_verified'"
	) as { event: string } | undefined;
	expect(row?.event).toBe('email_verified');
});
