/**
 * A month of the app handed over at sign-up.
 *
 * The invitation an operator sends before there is anything to buy — and, once
 * there is, instead of it. The account is subscribed from the moment it is made,
 * having paid nothing and having spent none of its free days, and then it
 * lapses like any other. Two things had to be got right and both are here:
 * the grant ends (an `invited` row used to mean full access forever, unconditionally),
 * and while it runs the account can still see the billing pages — because a
 * month on the house is only worth giving away if the person can decide to
 * stay before it runs out.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let billing: typeof import('../src/lib/server/services/billing');
let subscriptions: typeof import('../src/lib/server/services/subscriptions');

const now = new Date('2026-08-17T09:00:00Z');
const inAMonth = new Date('2026-09-16T09:00:00Z').toISOString();

beforeAll(async () => {
	billing = await import('../src/lib/server/services/billing');
	subscriptions = await import('../src/lib/server/services/subscriptions');
	process.env.ONTOPLANO_SELF_HOST = 'false';
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

describe('an account let in by an invitation that names an end date', () => {
	beforeAll(() => {
		billing.onboardEntitlement(OWNER, { grantsUntil: inAMonth }, now);
	});

	test('is subscribed straight away, from the invitation rather than a trial', () => {
		const plan = subscriptions.resolvePlan(OWNER, now);
		expect(plan.plan).toBe('pro');
		expect(plan.source).toBe('invited');
		expect(plan.until).toBe(inAMonth);
	});

	test('can still reach the billing pages, and is told when it ends', () => {
		const plan = subscriptions.resolvePlan(OWNER, now);
		expect(plan.billable).toBe(true);
		expect(plan.endingAt).toBe(inAMonth);
	});

	test('has spent no free days, so buying offers none', () => {
		// "Paid right now and got no days for free" is the whole point: the month
		// is the gift, and a trial on top of it would be a second one.
		expect(billing.checkoutTrialDays(OWNER)).toBe(0);
	});

	test('lapses when the date passes, like anything else that ran out', () => {
		const after = new Date('2026-10-01T09:00:00Z');
		const plan = subscriptions.resolvePlan(OWNER, after);
		expect(plan.plan).toBe('none');
		expect(plan.source).toBe('lapsed');
	});
});

describe('an account let in by an invitation with no end date', () => {
	beforeAll(() => {
		billing.onboardEntitlement(STRANGER, { grantsUntil: null }, now);
	});

	test('is the alpha deal: full access, no end, and no billing in its interface', () => {
		const plan = subscriptions.resolvePlan(STRANGER, now);
		expect(plan.plan).toBe('pro');
		expect(plan.source).toBe('invited');
		expect(plan.until).toBeNull();
		expect(plan.billable).toBe(false);
	});

	test('and it still holds a year later', () => {
		const plan = subscriptions.resolvePlan(STRANGER, new Date('2027-08-17T09:00:00Z'));
		expect(plan.plan).toBe('pro');
	});
});
