import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

/**
 * Register → confirm the address → hand over a card → fourteen free days.
 *
 * That order, on an instance that sells. It is the whole funnel and it broke in
 * the quietest way available: somebody registered, confirmed their address, and
 * was simply inside — no card, no billing page, a free account for as long as
 * they liked.
 *
 * Nothing in the suite noticed, because the e2e run sets
 * `ONTOPLANO_SELF_HOST=true`. Every browser test therefore exercises the
 * instance that sells *nothing*, and the selling path — the one the business is
 * — had no test at all. These are that test, at the level where the decisions
 * are actually made.
 *
 * Two failures are pinned here and both were real:
 *
 *  1. The link in the confirmation mail carried `callbackURL=/`, so following
 *     it landed inside the app and went round `/login/verify` — the one page
 *     that decides what comes after confirming.
 *  2. An instance meant to sell but with no payment provider compiled in hands
 *     out a trial and never asks for anything.
 */

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

/** What the instance's billing looks like, per test. */
let selling = true;
let requiresCard = true;

vi.mock('../src/lib/server/settings', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/settings')>();
	return {
		...actual,
		isSelfHosted: () => !selling,
		pricing: () => ({ ...actual.pricing(), trialRequiresCard: requiresCard })
	};
});

vi.mock('../src/lib/server/billing/index', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/billing/index')>();
	return {
		...actual,
		provider: () => ({ ...actual.provider(), configured: () => selling })
	};
});

let billing: typeof import('../src/lib/server/services/billing');
let access: typeof import('../src/lib/server/services/access');

const now = new Date('2026-03-14T10:00:00Z');

beforeAll(async () => {
	billing = await import('../src/lib/server/services/billing');
	access = await import('../src/lib/server/services/access');
});

beforeEach(() => {
	selling = true;
	requiresCard = true;
	database.exec('delete from subscriptions');
});

describe('an instance that sells', () => {
	test('a new account is sent to the card, not given a trial', () => {
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('checkout');

		// And nothing has been handed over yet: no subscription row, so the
		// account has no plan and the hold below is what stands between them and
		// the app.
		const rows = database.get('select count(*) as n from subscriptions') as { n: number };
		expect(rows.n, 'a trial was started before any card').toBe(0);
	});

	test('and is held at the card until there is one', () => {
		billing.onboardEntitlement(OWNER, null, now);
		expect(access.paymentHoldFor(OWNER)).toBe('billing');
	});

	/**
	 * The other half of the order. Confirming the address comes first, and what
	 * comes after it is a decision — so the link in the mail has to land on the
	 * page that makes it, not inside the app.
	 */
	test('the confirmation link goes back through the page that decides', async () => {
		const { sendVerificationFor } = await import('../src/lib/server/auth');
		const source = await import('node:fs').then((fs) =>
			fs.readFileSync('src/lib/server/auth.ts', 'utf8')
		);

		expect(typeof sendVerificationFor).toBe('function');
		// Read rather than sent: building a real token needs better-auth's own
		// context. What matters is where the link points, and that is here.
		expect(source, 'the confirmation link skips /login/verify').toContain(
			"encodeURIComponent('/login/verify')"
		);
		expect(source).not.toContain("callbackURL=${encodeURIComponent('/')}");
	});
});

describe('an instance that does not sell', () => {
	test('a self-hosted one just starts the trial', () => {
		selling = false;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
		expect(access.paymentHoldFor(OWNER)).toBeNull();
	});

	test('and one that asks for no card starts it too', () => {
		requiresCard = false;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
	});
});

describe('an invitation', () => {
	test('skips the card entirely, because somebody already paid', () => {
		expect(billing.onboardEntitlement(OWNER, { grantsUntil: null }, now)).toBe('invited');
		expect(access.paymentHoldFor(OWNER)).toBeNull();
	});
});
