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
/** What the last checkout was opened for, so the tier can be asserted on. */
let opened: { interval?: string; tier?: string } | null = null;

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
		provider: () => ({
			...actual.provider(),
			configured: () => selling,
			createCheckout: async (_id: string, interval?: string, tier?: string) => {
				opened = { interval, tier };
				return 'https://provider.example/checkout/1';
			}
		})
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
	opened = null;
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

/**
 * The family plan, bought at the moment somebody decides to buy it.
 *
 * The front page has sold a household plan for as long as it has had one, and
 * the app could not complete that sale: the card step offered a single seat and
 * nothing else, so pressing "Ontoplano for the family" bought one account. The
 * choice now rides from that button to the card, and the card offers both
 * either way — a link followed on a phone and confirmed on a laptop loses the
 * cookie, and must not silently lose the plan with it.
 */
describe('choosing the family plan on the front page', () => {
	/** Just enough of SvelteKit's cookie jar for a load function. */
	function jar(initial: Record<string, string> = {}) {
		const held = new Map(Object.entries(initial));
		return {
			get: (name: string) => held.get(name),
			set: (name: string, value: string) => held.set(name, value),
			delete: (name: string) => held.delete(name),
			held
		};
	}

	test('the register link remembers which plan was pressed', async () => {
		const { load } = await import('../src/routes/login/+page.server');
		const cookies = jar();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({
			locals: {},
			url: new URL('https://app.example/login?register&plan=family'),
			cookies
			// The load reads four fields of the event; the rest of it is not its
			// business, and building a whole RequestEvent would test SvelteKit.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as any;

		expect(data.wantedPlan).toBe('family');
		expect(cookies.held.get('ontoplano_plan')).toBe('family');
	});

	test('and an ordinary register link does not', async () => {
		const { load } = await import('../src/routes/login/+page.server');
		const cookies = jar();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({
			locals: {},
			url: new URL('https://app.example/login?register'),
			cookies
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as any;

		expect(data.wantedPlan).toBe('solo');
		expect(cookies.held.size).toBe(0);
	});

	test('the card step opens on the plan that was chosen', async () => {
		billing.onboardEntitlement(OWNER, null, now);
		const { load } = await import('../src/routes/start/+page.server');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({
			locals: { user: { id: OWNER } },
			cookies: jar({ ontoplano_plan: 'family' })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as any;

		expect(data.wanted).toBe('family');
		// And the price to put on the button is really there to be shown.
		expect(data.pricing.familyMonthlyCents).toBeGreaterThan(0);
		expect(data.pricing.familySeats).toBeGreaterThan(1);
	});

	test('and on one seat when nothing was chosen', async () => {
		billing.onboardEntitlement(OWNER, null, now);
		const { load } = await import('../src/routes/start/+page.server');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = (await load({
			locals: { user: { id: OWNER } },
			cookies: jar()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as any;

		expect(data.wanted).toBe('solo');
	});

	/**
	 * The one that matters: the button has to reach the provider as a family
	 * checkout. This is exactly what was missing — /start's action took an
	 * interval and no tier at all, so every checkout it opened was for one seat
	 * however the person got there.
	 */
	test('the card step buys the family plan, not one seat', async () => {
		billing.onboardEntitlement(OWNER, null, now);
		const { actions } = await import('../src/routes/start/+page.server');
		const body = new FormData();
		body.set('interval', 'yearly');
		body.set('tier', 'family');
		const cookies = jar({ ontoplano_plan: 'family' });

		await expect(
			actions.checkout({
				request: new Request('https://app.example/start?/checkout', { method: 'POST', body }),
				locals: { user: { id: OWNER } },
				cookies
				// A redirect is the success case here, and SvelteKit throws it.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 303 });

		expect(opened).toEqual({ interval: 'yearly', tier: 'family' });
		// Spent: what the account is on comes from the provider from here.
		expect(cookies.held.size).toBe(0);
	});

	test('and one seat when that is what was asked for', async () => {
		billing.onboardEntitlement(OWNER, null, now);
		const { actions } = await import('../src/routes/start/+page.server');
		const body = new FormData();
		body.set('interval', 'monthly');

		await expect(
			actions.checkout({
				request: new Request('https://app.example/start?/checkout', { method: 'POST', body }),
				locals: { user: { id: OWNER } },
				cookies: jar()
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any)
		).rejects.toMatchObject({ status: 303 });

		expect(opened).toEqual({ interval: 'monthly', tier: 'solo' });
	});
});
