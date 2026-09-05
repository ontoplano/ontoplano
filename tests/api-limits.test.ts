/**
 * What one plugin can do to the server.
 *
 * The API had no rate limit at all: a token was a licence to knock as often as
 * you liked, which on a shared instance is one misconfigured producer away from
 * everybody else's app being slow.
 *
 * Tested here rather than through a browser because it is server logic — the
 * interesting questions are whether the budget is per token, whether reads and
 * writes have separate ones, and whether a refused request costs the caller its
 * budget, none of which a browser can see.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	api: typeof import('../src/lib/server/api/auth');
	tokens: typeof import('../src/lib/server/services/tokens');
	errors: typeof import('../src/lib/server/services/errors');
	subscriptions: typeof import('../src/lib/server/services/subscriptions');
};

let s: Services;
let mine: string;
let theirs: string;

/** The smallest thing `authenticateApi` will accept as a request. */
function asEvent(token: string, method = 'GET') {
	return {
		request: new Request('https://example.test/api/v1/today', {
			method,
			headers: { authorization: `Bearer ${token}` }
		}),
		locals: {}
	} as unknown as Parameters<Services['api']['authenticateApi']>[0];
}

beforeAll(async () => {
	s = {
		api: await import('../src/lib/server/api/auth'),
		tokens: await import('../src/lib/server/services/tokens'),
		errors: await import('../src/lib/server/services/errors'),
		subscriptions: await import('../src/lib/server/services/subscriptions')
	};

	const ctx = { userId: OWNER, now: new Date('2026-08-27T09:00:00'), tz: 'UTC' };
	const other = { ...ctx, userId: STRANGER };

	mine = s.tokens.createToken(ctx, { name: 'mine', scopes: ['today:read'] }).plaintext;
	theirs = s.tokens.createToken(other, { name: 'theirs', scopes: ['today:read'] }).plaintext;
});

/** Knock until refused, or give up. Returns how many got through. */
function knockUntilRefused(token: string, method = 'GET', cap = 400): number {
	for (let i = 0; i < cap; i++) {
		try {
			s.api.authenticateApi(asEvent(token, method), 'today:read');
		} catch (e) {
			if (e instanceof s.errors.RateLimitedError) return i;
			throw e;
		}
	}
	return cap;
}

describe('how often one token may knock', () => {
	test('a read budget exists, and is not tiny', () => {
		const got = knockUntilRefused(mine);
		expect(got).toBeGreaterThan(100);
		expect(got).toBeLessThan(400);
	});

	test('the refusal says when to come back', () => {
		try {
			s.api.authenticateApi(asEvent(mine), 'today:read');
			throw new Error('expected the exhausted token to be refused');
		} catch (e) {
			expect(e).toBeInstanceOf(s.errors.RateLimitedError);
			expect((e as Error).message).toMatch(/seconds/);
		}
	});

	test('and it is that token, not that account, not the whole server', () => {
		// The first token is spent; another account's is untouched.
		expect(() => s.api.authenticateApi(asEvent(theirs), 'today:read')).not.toThrow();
	});
});

describe('writes are budgeted separately', () => {
	test('a spent read budget does not spend the write one', () => {
		// `mine` has no reads left from the block above.
		expect(() => s.api.authenticateApi(asEvent(mine, 'POST'), 'today:read')).not.toThrow();
	});

	test('writes run out sooner than reads, because they cost more', () => {
		const writes = knockUntilRefused(theirs, 'POST');
		const reads = knockUntilRefused(theirs, 'GET');
		expect(writes).toBeLessThan(reads);
	});
});

describe('the account has a ceiling above its tokens', () => {
	test('a fresh token cannot restore a spent account', () => {
		// `theirs` has spent most of STRANGER's account budget above. Two more
		// tokens: the first may exhaust its own per-token budget, but the second
		// must be stopped by the account ceiling well before its token one.
		const other = { userId: STRANGER, now: new Date('2026-08-27T09:05:00'), tz: 'UTC' };
		const t2 = s.tokens.createToken(other, { name: 't2', scopes: ['today:read'] }).plaintext;
		const t3 = s.tokens.createToken(other, { name: 't3', scopes: ['today:read'] }).plaintext;

		knockUntilRefused(t2);
		const got = knockUntilRefused(t3);

		expect(got).toBeGreaterThan(0);
		expect(got).toBeLessThan(240);
	});
});

describe('what it will read', () => {
	test('a body far larger than any real payload is refused before parsing', async () => {
		const event = {
			request: new Request('https://example.test/api/v1/streams', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slug: 'x'.repeat(300_000) })
			})
		} as unknown as Parameters<Services['api']['readJson']>[0];

		await expect(s.api.readJson(event)).rejects.toThrow(/too large/i);
	});

	test('an ordinary body still reads', async () => {
		const event = {
			request: new Request('https://example.test/api/v1/streams', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ slug: 'weight' })
			})
		} as unknown as Parameters<Services['api']['readJson']>[0];

		await expect(s.api.readJson(event)).resolves.toEqual({ slug: 'weight' });
	});
});

describe('the token meter on the billing page', () => {
	test('counts the tokens an account holds, not the ones it has revoked', () => {
		const ctx = { userId: OWNER, now: new Date('2026-08-27T09:00:00'), tz: 'UTC' };
		const before = s.subscriptions.usage(OWNER).apiTokens;

		const made = s.tokens.createToken(ctx, { name: 'short-lived', scopes: ['today:read'] });
		expect(s.subscriptions.usage(OWNER).apiTokens).toBe(before + 1);

		// The row stays behind so the old secret can never be honoured again,
		// but the account does not hold that token any more. Counting the row
		// made the meter climb with every token ever made and would have refused
		// a twenty-first after twenty revocations.
		s.tokens.revokeToken(ctx, made.id);
		expect(s.tokens.listTokens(ctx).some((t) => t.id === made.id)).toBe(false);
		expect(s.subscriptions.usage(OWNER).apiTokens).toBe(before);
	});
});
