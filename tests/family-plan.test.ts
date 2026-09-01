/**
 * One subscription, several accounts.
 *
 * A family plan is not a second product: it is the same subscription with more
 * seats on it, and a member has no subscription row of their own — they resolve
 * through whoever is paying. That direction is the point. Copying the plan onto
 * each member would need keeping in step with the provider five times over, and
 * would leave four entitled accounts behind the day the payer cancels.
 *
 * What is pinned here: a seat grants access and nothing else, the seat count is
 * whatever the plan actually has room for, cancelling the payer's plan takes
 * everybody with it, and nothing about one account is visible to another.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let access: typeof import('../src/lib/server/services/access');
let db: typeof import('../src/lib/server/db');
let schema: typeof import('../src/lib/server/db/schema');

/** The seeded second account's address, read rather than assumed. */
function strangerEmail(): string {
	return db.db
		.select({ email: schema.user.email, id: schema.user.id })
		.from(schema.user)
		.all()
		.find((row) => row.id === STRANGER)!.email;
}

/** Give the payer a live family subscription with `seats` on it. */
function payerHas(seats: number) {
	subscriptions.applySubscription(OWNER, {
		plan: 'pro',
		status: 'active',
		provider: 'paddle',
		providerSubscriptionId: 'sub_family_test',
		currentPeriodEnd: '2126-01-01T00:00:00.000Z',
		seats
	});
}

beforeAll(async () => {
	process.env.ONTOPLANO_SELF_HOST = 'false';
	subscriptions = await import('../src/lib/server/services/subscriptions');
	access = await import('../src/lib/server/services/access');
	db = await import('../src/lib/server/db');
	schema = await import('../src/lib/server/db/schema');
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

describe('seats', () => {
	test('a plan covers one account until the provider says otherwise', () => {
		payerHas(1);
		expect(subscriptions.seatsFor(OWNER)).toBe(1);
		expect(() => subscriptions.addToPlan(OWNER, strangerEmail())).toThrow(/covers one account/);
	});

	test('a family plan lets the payer put somebody on it', () => {
		payerHas(5);
		const added = subscriptions.addToPlan(OWNER, strangerEmail());
		expect(added.id).toBe(STRANGER);
		expect(subscriptions.membersOf(OWNER).map((m) => m.id)).toEqual([STRANGER]);
	});

	test('and that account is Pro without paying for anything', () => {
		const theirs = subscriptions.resolvePlan(STRANGER);
		expect(theirs.plan).toBe('pro');
		expect(theirs.source).toBe('family');
		// A seat is access, never the ability to spend: the billing pages belong
		// to whoever holds the card.
		expect(theirs.billable).toBe(false);
		expect(access.paymentHoldFor(STRANGER)).toBe(null);
	});

	test('the same account cannot be added twice', () => {
		expect(() => subscriptions.addToPlan(OWNER, strangerEmail())).toThrow(/already on a plan/);
	});

	test('an address with no account here is refused, and says no more than that', () => {
		expect(() => subscriptions.addToPlan(OWNER, 'nobody@test.invalid')).toThrow(
			/No account here uses that address/
		);
	});

	test('the payer cannot add themselves', () => {
		const own = db.db
			.select({ email: schema.user.email, id: schema.user.id })
			.from(schema.user)
			.all()
			.find((row) => row.id === OWNER)!.email;
		expect(() => subscriptions.addToPlan(OWNER, own)).toThrow();
	});

	test('when the payer lapses, the seat lapses with them', () => {
		subscriptions.applySubscription(OWNER, {
			plan: 'none',
			status: 'expired',
			provider: 'paddle',
			providerSubscriptionId: 'sub_family_test',
			currentPeriodEnd: '2020-01-01T00:00:00.000Z',
			seats: 5
		});

		expect(subscriptions.resolvePlan(OWNER).plan).toBe('none');
		// Read through rather than copied: nothing had to be updated for this.
		expect(subscriptions.resolvePlan(STRANGER).plan).toBe('none');
	});

	test('taking a seat away leaves the account, and only removes the seat', () => {
		payerHas(5);
		expect(subscriptions.resolvePlan(STRANGER).plan).toBe('pro');

		subscriptions.removeFromPlan(OWNER, STRANGER);
		expect(subscriptions.membersOf(OWNER)).toEqual([]);
		expect(subscriptions.resolvePlan(STRANGER).plan).toBe('none');
		expect(subscriptions.seatOwnerOf(STRANGER)).toBeNull();
	});

	test('and removing a seat that is not there is an error, not a silent no-op', () => {
		expect(() => subscriptions.removeFromPlan(OWNER, STRANGER)).toThrow();
	});
});

/**
 * Deleting an account that is entangled in a plan.
 *
 * Neither side of a seat carries a `user_id`, so the table-walk that empties an
 * account cannot see them — which means the foreign key refuses the delete, and
 * a seat pointing at a deleted payer would leave somebody entitled by a row
 * nobody can cancel. Both directions are checked because both were missed.
 */
describe('deleting an account takes its seats with it', () => {
	let account: typeof import('../src/lib/server/services/account');

	beforeAll(async () => {
		account = await import('../src/lib/server/services/account');
	});

	test('a member can be deleted while somebody is paying for them', () => {
		payerHas(5);
		subscriptions.addToPlan(OWNER, strangerEmail());
		expect(subscriptions.membersOf(OWNER)).toHaveLength(1);

		expect(() => account.deleteAccount(STRANGER)).not.toThrow();
		expect(subscriptions.membersOf(OWNER)).toEqual([]);
	});
});
