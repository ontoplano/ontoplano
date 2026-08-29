/**
 * The admin-granted trial: for accounts that predate billing.
 *
 * An instance that ran as self-hosted and then turns billing on has accounts
 * with no subscription rows, which would freeze at plan "none". The grant
 * exists for exactly them — and for nobody who already has a plan history,
 * because a second trial is a discount and discounts belong to the provider.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let admin: typeof import('../src/lib/server/services/admin');
let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let audit: typeof import('../src/lib/server/services/audit');

beforeAll(async () => {
	admin = await import('../src/lib/server/services/admin');
	subscriptions = await import('../src/lib/server/services/subscriptions');
	audit = await import('../src/lib/server/services/audit');

	// Owner powers exist only under self-host, so hand out a column role while
	// they still work — then run hosted, which is where this feature lives.
	admin.setRole(OWNER, STRANGER, 'admin');
	process.env.ONTOPLANO_SELF_HOST = 'false';
});

afterAll(() => {
	process.env.ONTOPLANO_SELF_HOST = 'true';
});

describe('grantTrial', () => {
	test('only an administrator may grant', () => {
		expect(() => admin.grantTrial(OWNER, OWNER)).toThrow();
	});

	test('an account with no plan history gets a trial, signed by the actor', () => {
		expect(admin.accountById(OWNER).canGrantTrial).toBe(true);

		admin.grantTrial(STRANGER, OWNER);

		const plan = subscriptions.resolvePlan(OWNER);
		expect(plan.source).toBe('trial');
		expect(plan.plan).toBe('pro');

		const granted = audit.listForSubject(OWNER).find((e) => e.event === 'plan_changed');
		expect(granted?.actorId).toBe(STRANGER);
	});

	test('an account with plan history is refused', () => {
		expect(admin.accountById(OWNER).canGrantTrial).toBe(false);
		expect(() => admin.grantTrial(STRANGER, OWNER)).toThrow(/history/i);
	});
});
