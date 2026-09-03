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

/**
 * What the instance looks like, per test.
 *
 * Two switches, not one, because the bug lived in the gap between them:
 * `selfHosted` is what the operator declared, `providerWorks` is whether a card
 * can actually be taken. Every earlier version of this file conflated them, so
 * the state that gave the app away — *not* self-hosted, provider not working —
 * was not expressible here at all.
 */
let selfHosted = false;
let providerWorks = true;
let requiresCard = true;
/** What the last checkout was opened for, so the tier can be asserted on. */
let opened: { interval?: string; tier?: string } | null = null;

/**
 * Whether the instance says it sells — an environment variable, so a test sets
 * the environment.
 *
 * It is opt-in on purpose. Almost every copy of this app is somebody's own and
 * never configures anything about money; if "not self-hosted" implied "sells",
 * the refusal below would meet a self-hoster on their first registration.
 */
function declareSelling(yes: boolean): void {
	if (yes) process.env.ONTOPLANO_SELLS = 'true';
	else delete process.env.ONTOPLANO_SELLS;
}

vi.mock('../src/lib/server/settings', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/settings')>();
	return {
		...actual,
		isSelfHosted: () => selfHosted,
		pricing: () => ({ ...actual.pricing(), trialRequiresCard: requiresCard })
	};
});

/*
 * The real provider with two answers replaced — through a Proxy, not a spread.
 *
 * `{ ...provider() }` looks equivalent and is not. On a clone with no private
 * provider compiled in, `provider()` is `NoBilling`, whose methods live on a
 * class prototype: spreading copies the two fields and drops every method, so
 * `displayPricing` reached `provider().pricing()` and found nothing there. It
 * passed on a machine that has the private Paddle module — a plain object,
 * whose methods spread fine — and failed on CI, which is exactly the wrong way
 * round for a test about the instance that sells.
 */
vi.mock('../src/lib/server/billing/index', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/billing/index')>();
	return {
		...actual,
		provider: () => {
			const real = actual.provider();
			return new Proxy(real, {
				get(target, key, receiver) {
					if (key === 'configured') return () => providerWorks;
					// Coherent with the line above: a provider that says it is not
					// working and then lists nothing missing is a state no real one
					// is in, and asserting against it would prove nothing.
					if (key === 'missing') return () => (providerWorks ? [] : ['PADDLE_API_KEY']);
					if (key === 'createCheckout') {
						return async (_id: string, interval?: string, tier?: string) => {
							opened = { interval, tier };
							return 'https://provider.example/checkout/1';
						};
					}
					const value = Reflect.get(target, key, receiver);
					// Bound, because a method read off a proxy and called loses `this`.
					return typeof value === 'function' ? value.bind(target) : value;
				}
			});
		}
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
	selfHosted = false;
	providerWorks = true;
	requiresCard = true;
	opened = null;
	declareSelling(true);
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
	test('one that never mentions money just starts the trial', () => {
		// No flags at all: a fresh clone, which is the commonest instance there
		// is and the one that must need no configuration.
		declareSelling(false);
		providerWorks = false;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
		expect(access.paymentHoldFor(OWNER)).toBeNull();
		expect(billing.whyItCannotSell(), 'a personal instance is not broken').toBeNull();
	});

	test('a self-hosted one just starts the trial', () => {
		selfHosted = true;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
		expect(access.paymentHoldFor(OWNER)).toBeNull();
	});

	test('and it does not matter that no provider is compiled in', () => {
		selfHosted = true;
		providerWorks = false;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
	});

	test('and one that asks for no card starts it too', () => {
		requiresCard = false;
		selfHosted = true;
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
	});
});

/**
 * The state that actually happened, and that nothing here could express.
 *
 * A production instance whose provider is not working — absent from the build,
 * a key that never reached the environment, `ONTOPLANO_SELF_HOST` still set
 * from before it started selling — is indistinguishable, from inside the app,
 * from somebody's own copy. So it took the friendly branch: fourteen free days,
 * every registration, silently, for as long as nobody looked. Which is how a
 * business loses its customers permanently rather than noisily.
 *
 * The rule is now: an instance that means to sell and cannot takes nobody's
 * registration. That costs the accounts of the minutes before somebody notices;
 * the alternative costs the money of every account that ever signs up.
 */
describe('an instance that means to sell and cannot', () => {
	beforeEach(() => {
		selfHosted = false;
		declareSelling(true);
		providerWorks = false;
	});

	test('refuses, rather than handing out a free trial', () => {
		expect(() => billing.onboardEntitlement(OWNER, null, now)).toThrow(
			/set up to charge and cannot/i
		);

		const rows = database.get('select count(*) as n from subscriptions') as { n: number };
		expect(rows.n, 'a trial was started on an instance that cannot charge').toBe(0);
	});

	test('and says so in one sentence, for the administration page', () => {
		const said = billing.whyItCannotSell() ?? '';
		expect(said).toMatch(/set up to charge/i);
		// Actionable, not merely true: "no working payment provider" is a
		// sentence that ends in reading source code.
		expect(said, 'the message names nothing an operator can act on').toMatch(
			/[A-Z_]{6,}|no payment provider in it/
		);
	});

	test('while a working one says nothing is wrong', () => {
		providerWorks = true;
		expect(billing.whyItCannotSell()).toBeNull();
	});

	test('and a self-hosted instance is never "broken" — it just does not sell', () => {
		selfHosted = true;
		expect(billing.whyItCannotSell()).toBeNull();
	});

	test('nor is one that simply never said it sells', () => {
		declareSelling(false);
		expect(billing.whyItCannotSell()).toBeNull();
		expect(billing.onboardEntitlement(OWNER, null, now)).toBe('trial');
	});

	/**
	 * An invitation is somebody else's seat, already paid for. It must keep
	 * working while the checkout is broken, or a family cannot be let in.
	 */
	test('but an invitation still lands', () => {
		expect(billing.onboardEntitlement(OWNER, { grantsUntil: null }, now)).toBe('invited');
	});

	/**
	 * The refusal has to happen before the account row exists. A registration
	 * that half-succeeded would leave a real account with no entitlement and no
	 * way to get one.
	 */
	test('the register form checks before it writes anything', async () => {
		const source = await import('node:fs').then((fs) =>
			fs.readFileSync('src/routes/login/+page.server.ts', 'utf8')
		);
		const guard = source.indexOf('whyItCannotSell()');
		const signUp = source.indexOf('auth.api.signUpEmail');
		expect(guard, 'the register action does not check at all').toBeGreaterThan(0);
		expect(guard, 'it checks after creating the account').toBeLessThan(signUp);
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
