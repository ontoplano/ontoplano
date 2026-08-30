/**
 * Naming a device, and the holds that stop an account.
 *
 * The sessions page exists so somebody can look at a list and say "that one
 * isn't me". That only works if the rows are recognisable, which is all
 * `describeUserAgent` is for — the string is self-reported free text, so the
 * job is to tell a phone from the laptop left at the office, not to build a
 * device database.
 *
 * The holds are decided in one place on purpose: the page gate and the API
 * door both ask the same function, so a route added later cannot forget a rule
 * it never had to remember.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let sessions: typeof import('../src/lib/server/services/sessions');
let access: typeof import('../src/lib/server/services/access');

beforeAll(async () => {
	sessions = await import('../src/lib/server/services/sessions');
	access = await import('../src/lib/server/services/access');
});

describe('naming a device from what it says about itself', () => {
	const CHROME_ANDROID =
		'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
	const SAFARI_IPHONE =
		'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
	const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';

	test('reads the browser and the machine it is on', () => {
		expect(sessions.describeUserAgent(CHROME_ANDROID)).toBe('Chrome on Android');
		expect(sessions.describeUserAgent(FIREFOX_LINUX)).toBe('Firefox on Linux');
	});

	test('does not call every browser Safari', () => {
		// Chrome and Edge both carry "Safari" in their string, and an iPhone
		// carries "Mac OS X" — a naive read makes every row say the same thing,
		// which is exactly the row nobody can identify.
		expect(sessions.describeUserAgent(SAFARI_IPHONE)).toBe('Safari on iOS');

		const edge = 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
		expect(sessions.describeUserAgent(edge)).toBe('Edge on Windows');

		const opera = 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36 OPR/112.0.0.0';
		expect(sessions.describeUserAgent(opera)).toBe('Opera on Windows');
	});

	test('says what it can when it only recognises half', () => {
		expect(sessions.describeUserAgent('Firefox/127.0')).toBe('Firefox');
		expect(sessions.describeUserAgent('something (Windows NT 10.0)')).toBe('Windows');
	});

	test('and says so plainly when it recognises nothing', () => {
		expect(sessions.describeUserAgent('curl/8.5.0')).toBe('Unknown device');
		expect(sessions.describeUserAgent('')).toBe('Unknown device');
		expect(sessions.describeUserAgent(null)).toBe('Unknown device');
		expect(sessions.describeUserAgent(undefined)).toBe('Unknown device');
	});
});

describe('a session addressed by its id', () => {
	test('is a 404 when it is not this account’s', () => {
		// The token never leaves the server: the page addresses a session by id,
		// and an id that is not yours has to look exactly like one that does not
		// exist.
		const ctx = { userId: OWNER, now: new Date(), tz: 'UTC' };
		expect(() => sessions.sessionTokenById(ctx, 'no-such-session')).toThrow();
	});

	test('and the list never carries a working credential', () => {
		const ctx = { userId: OWNER, now: new Date(), tz: 'UTC' };
		const listed = sessions.listSessions(ctx);
		for (const row of listed) expect(Object.keys(row)).not.toContain('token');
	});
});

describe('what stops an account', () => {
	test('nothing, on an instance that sells nothing', () => {
		// Self-hosted is the default: no billing configured, no holds.
		expect(access.accessHoldFor({ id: OWNER, emailVerified: true })).toBeNull();
		expect(access.paymentHoldFor(OWNER)).toBeNull();
	});

	test('a held browser is sent somewhere it can act', () => {
		// Not to a dead end explaining the hold — to the page that lifts it.
		expect(access.holdDestination('verify')).toBe('/login/verify');
		expect(access.holdDestination('billing')).toBe('/start');
		expect(access.holdDestination('expired')).toBe('/start');
	});
});
