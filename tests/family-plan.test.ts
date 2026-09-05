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
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
/*
 * The registration-mode config, before anything imports the config module —
 * it reads ONTOPLANO_CONFIG_DIR once, at load. The invite tests below rewrite
 * this file to move between open and closed.
 */
const configDir = dirname(database.path);
process.env.ONTOPLANO_CONFIG_DIR = configDir;
writeFileSync(
	join(configDir, 'config.toml'),
	'[server]\n\n[database]\n\n[week]\n\n[registration]\nmode = "open"\n'
);
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

	test('and that account is subscribed without paying for anything', () => {
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
describe('the price a family account is quoted', () => {
	let plans: typeof import('../src/lib/plans');
	let load: (event: { locals: { user: { id: string } } }) => Promise<Record<string, unknown>>;

	beforeAll(async () => {
		plans = await import('../src/lib/plans');
		load = (await import('../src/routes/settings/billing/+page.server')).load as never;
	});

	test('the family rate is not the solo rate', () => {
		const solo = plans.tierPricing(plans.DEFAULT_PRICING, 'solo');
		const family = plans.tierPricing(plans.DEFAULT_PRICING, 'family');
		expect(family.monthlyCents).toBeGreaterThan(solo.monthlyCents);
		expect(family.yearlyCents).toBeGreaterThan(solo.yearlyCents);
	});

	test('a plan with seats on it reports the family tier', async () => {
		payerHas(5);
		const data = await load({ locals: { user: { id: OWNER } } });
		expect(data.tier).toBe('family');
		const quoted = plans.tierPricing(data.pricing as never, data.tier as never);
		expect(quoted.yearlyCents).toBe(plans.DEFAULT_PRICING.familyYearlyCents);
	});

	test('and a one-seat plan reports the solo tier', async () => {
		payerHas(1);
		const data = await load({ locals: { user: { id: OWNER } } });
		expect(data.tier).toBe('solo');
		const quoted = plans.tierPricing(data.pricing as never, data.tier as never);
		expect(quoted.yearlyCents).toBe(plans.DEFAULT_PRICING.yearlyCents);
	});
});

/**
 * And the page has to read it.
 *
 * The loader can be right while the markup quotes the list price beside it —
 * which is exactly how this shipped. A source check, because the alternative
 * is an end-to-end test that needs a real provider to sell a family plan.
 */
test('the billing page describes the current plan from its own tier', async () => {
	const { readFileSync } = await import('node:fs');
	const source = readFileSync('src/routes/settings/billing/+page.svelte', 'utf8');
	expect(source).toContain('tierPricing(data.pricing, data.tier)');
	// `mine` is the tier-corrected pricing, and it is what every sentence about
	// the running subscription reads. The list price survives only on the buy
	// buttons, where both plans are offered side by side.
	expect(source).not.toContain('describeYearly(data.pricing)');
	expect(source).toContain('formatPrice(mine.yearlyCents, mine.currency)');
	expect(source).toContain('formatPrice(mine.monthlyCents, mine.currency)');
});

/**
 * And the tab is only there for the people it is for.
 *
 * Seat management used to be a card at the bottom of Billing, which a member
 * — who has no billing page at all — could not reach. It is its own tab now,
 * shown to the payer of a plan with room on it and to anybody sitting on one
 * of its seats, and to nobody else.
 */
describe('the Family tab', () => {
	let settingsLoad: (event: { locals: { user: { id: string } } }) => Promise<{ family: boolean }>;

	beforeAll(async () => {
		settingsLoad = (await import('../src/routes/settings/+layout.server')).load as never;
	});

	test('is not there for an account paying for itself', async () => {
		payerHas(1);
		expect((await settingsLoad({ locals: { user: { id: OWNER } } })).family).toBe(false);
	});

	test('is there for the payer of a plan with seats', async () => {
		payerHas(5);
		expect((await settingsLoad({ locals: { user: { id: OWNER } } })).family).toBe(true);
	});

	test("and for somebody on somebody else's plan", async () => {
		payerHas(5);
		if (subscriptions.membersOf(OWNER).length === 0) {
			subscriptions.addToPlan(OWNER, strangerEmail());
		}
		expect((await settingsLoad({ locals: { user: { id: STRANGER } } })).family).toBe(true);
	});
});

describe('deleting an account takes its seats with it', () => {
	let account: typeof import('../src/lib/server/services/account');

	beforeAll(async () => {
		account = await import('../src/lib/server/services/account');
	});

	test('a member can be deleted while somebody is paying for them', () => {
		payerHas(5);
		// The tab test above may already have seated them; either way this test
		// wants exactly one member on the plan before it deletes the account.
		if (subscriptions.membersOf(OWNER).length === 0) {
			subscriptions.addToPlan(OWNER, strangerEmail());
		}
		expect(subscriptions.membersOf(OWNER)).toHaveLength(1);

		expect(() => account.deleteAccount(STRANGER)).not.toThrow();
		expect(subscriptions.membersOf(OWNER)).toEqual([]);
	});
});

/**
 * What a family plan is told it costs.
 *
 * The billing page quoted `pricing.monthlyCents` whatever the account was on,
 * so a household paying the family rate was shown the solo price — and the
 * "switch to yearly" line offered them a saving that belonged to a different
 * plan. The seat count is the fact that decides it.
 */

/**
 * Inviting an address that has no account yet.
 *
 * The payer types an email; the account is made on the spot with a password
 * nobody knows, the seat attached, and the mail carries better-auth's own
 * verification link — which verifies, signs in, and lands on /welcome. Only
 * where registration is open: anywhere else, a payer typing addresses must
 * not be a way to mint accounts.
 */
describe('inviting somebody with no account', () => {
	function setRegistration(mode: string) {
		writeFileSync(
			join(configDir, 'config.toml'),
			`[server]\n\n[database]\n\n[week]\n\n[registration]\nmode = "${mode}"\n`
		);
	}

	test('makes the account, seats it, and swaps the letter', async () => {
		payerHas(5);
		setRegistration('open');

		const invite = await import('../src/lib/server/services/family-invite');
		const { inviteToPlan } = invite;
		const before = subscriptions.membersOf(OWNER).length;

		const made = await inviteToPlan(OWNER, 'partner@example.test');
		expect(made.invited).toBe(true);
		expect(subscriptions.membersOf(OWNER).length).toBe(before + 1);

		// The seat resolves like any other.
		expect(subscriptions.resolvePlan(made.id).source).toBe('family');

		// The verification sender took the invite entry, so a later resend gets
		// the ordinary letter rather than a second invitation.
		expect(invite.takeFamilyInvite('partner@example.test')).toBeNull();
	});

	test('an existing account still lands instantly, not by mail', async () => {
		payerHas(5);
		const { inviteToPlan } = await import('../src/lib/server/services/family-invite');
		// The account the first test minted, taken off the plan and re-added:
		// this time it exists, so no mail and no second account.
		const partner = subscriptions.membersOf(OWNER).find((m) => m.email.startsWith('partner@'))!;
		subscriptions.removeFromPlan(OWNER, partner.id);
		const added = await inviteToPlan(OWNER, 'partner@example.test');
		expect(added.invited).toBe(false);
		expect(added.id).toBe(partner.id);
	});

	test('a closed instance refuses to mint an account for a seat', async () => {
		payerHas(5);
		const { inviteToPlan } = await import('../src/lib/server/services/family-invite');
		setRegistration('invite');
		await expect(inviteToPlan(OWNER, 'nobody-here@example.test')).rejects.toThrow(
			/No account here uses that address/
		);
		setRegistration('open');
	});
});

/**
 * The instance page's answer to "are reminders actually running".
 *
 * The app's own record of being asked outranks systemd: the endpoint stamps
 * every call, so "last asked a minute ago" is true whether the asker is the
 * timer, cron, or a curl in a loop — and it needs no permissions at all.
 */
describe('the companion services card', () => {
	test('a fresh stamp reads as running, and its absence as silence', async () => {
		const { markJobRan, companions } = await import('../src/lib/server/services/companions');

		markJobRan('reminders');
		const rows = await companions();
		const reminders = rows.find((r) => r.label === 'Reminders')!;
		expect(reminders.ok).toBe(true);
		expect(reminders.detail).toContain('last asked this app');
		expect(reminders.fix).toBe('');

		// Every row that is not fine ends with the command that fixes it.
		for (const row of rows.filter((r) => !r.ok)) {
			expect(row.fix, `${row.label} has no fix command`).toContain('systemctl');
		}
	});
});
