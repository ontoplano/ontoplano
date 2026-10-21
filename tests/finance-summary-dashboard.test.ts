import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

/*
 * The dashboard's money card is the overview's glance, not a second reading.
 *
 * It is only computed when the account actually put it on the dashboard —
 * several grouped reads on every visit for a card nobody asked for is not a
 * default — so both halves need holding: no card, no query; card, the same
 * per-currency figures the room shows (and a recorded subtotal never called a
 * balance).
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const commitments = await import('../src/lib/services/commitments');
const budgets = await import('../src/lib/services/budgets');
const settings = await import('../src/lib/services/settings');
const { defaultLayout, serialiseLayout, serialiseSeen } = await import('../src/lib/dashboard');
const { DASHBOARD_LAYOUT_KEY, DASHBOARD_SEEN_KEY } = await import('../src/lib/dashboard');
const { load } = await import('../src/routes/+page.server');

const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };

function dashboard() {
	return load({ locals: { user: { id: OWNER } } } as never) as Promise<{
		moneyPictureCard: {
			currencies: {
				currency: string | null;
				fundsMinor: number | null;
				recordedOnlyMinor: number;
				availableMinor: number | null;
				coverage: { accounts: number };
				spending: { netMinor: number };
				budgets: { remainingMinor: number }[];
			}[];
		} | null;
	}>;
}

test('the money card is computed only when the dashboard holds it', async () => {
	// Off the dashboard: no card and no money query.
	const without = await dashboard();
	expect(without.moneyPictureCard).toBeNull();

	settings.setUserSetting(
		OWNER,
		DASHBOARD_LAYOUT_KEY,
		serialiseLayout([...defaultLayout(), 'moneyPicture'])
	);
	settings.setUserSetting(OWNER, DASHBOARD_SEEN_KEY, serialiseSeen());
	const empty = await dashboard();
	expect(empty.moneyPictureCard).toEqual({
		month: expect.any(String),
		asOf: expect.any(String),
		currencies: []
	});
});

test('the card carries the same per-currency figures the overview shows', async () => {
	const ledger = ledgers.createLedger(ctx, {
		name: 'Dashboard source',
		currency: 'KES',
		openingOn: '2026-09-01',
		openingMinor: 100000
	});
	statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-02',
		amountCents: -2500,
		description: 'Dashboard coffee'
	});
	commitments.createCommitment(ctx, {
		kind: 'reserve',
		name: 'Dashboard reserve',
		currency: 'KES',
		openingMinor: 10000
	});
	statements.createRule(ctx, { kind: 'category', name: 'Coffee', pattern: 'coffee' });
	budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Coffee',
		currency: 'KES',
		amountMinor: 50000
	});
	const recorded = ledgers.createLedger(ctx, { name: 'Dashboard recorded', currency: 'GBP' });
	statements.recordMovement(ctx, {
		ledgerId: recorded.id,
		occurredOn: '2026-10-02',
		amountCents: 700,
		description: 'Dashboard pounds'
	});

	const data = await dashboard();
	const kes = data.moneyPictureCard!.currencies.find((picture) => picture.currency === 'KES')!;
	expect(kes.fundsMinor).toBe(97500);
	expect(kes.availableMinor).toBe(87500);
	expect(kes.budgets).toMatchObject([{ remainingMinor: 47500 }]);

	const gbp = data.moneyPictureCard!.currencies.find((picture) => picture.currency === 'GBP')!;
	expect(gbp.fundsMinor).toBeNull();
	expect(gbp.availableMinor).toBeNull();
	expect(gbp.recordedOnlyMinor).toBe(700);
	expect(gbp.coverage.accounts).toBe(1);
});
