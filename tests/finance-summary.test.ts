import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const stocks = await import('../src/lib/services/commitments');
const budgets = await import('../src/lib/services/budgets');
const { moneyOverview } = await import('../src/lib/services/finance-summary');

const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };
const other = { ...ctx, userId: STRANGER };
let sequence = 0;
function fixture(currency: string | null = 'KES', opening?: number) {
	return ledgers.createLedger(ctx, {
		name: `Summary ${++sequence}`,
		currency,
		...(opening === undefined ? {} : { openingOn: '2026-09-01', openingMinor: opening })
	});
}
function line(
	ledgerId: number,
	occurredOn: string,
	amountCents: number,
	description = 'Summary line'
) {
	return statements.recordMovement(ctx, { ledgerId, occurredOn, amountCents, description });
}
function picture(currency: string | null, month = '2026-10') {
	return moneyOverview(ctx, { month }).currencies.find((row) => row.currency === currency)!;
}

test('every original currency answers separately and names how many accounts are supported', () => {
	const kes = fixture('KES', 100000);
	const kesRecorded = fixture('KES');
	line(kesRecorded.id, '2026-10-02', -5000, 'Recorded only line');
	const usd = fixture('USD', 2000);

	const overview = moneyOverview(ctx, { month: '2026-10' });
	expect(overview.month).toBe('2026-10');
	expect(overview.asOf).toBe('2026-10-19');

	const k = overview.currencies.find((row) => row.currency === 'KES')!;
	expect(k.fundsMinor).toBe(100000);
	expect(k.coverage).toEqual({ accounts: 2, supported: 1, verified: 0, recorded: 1 });
	expect(k.availableMinor).toBe(100000);
	expect(k.recordedOnlyMinor).toBe(-5000);
	expect(k.gaps).toContainEqual({
		kind: 'no-opening',
		count: 1,
		ledgers: [{ id: kesRecorded.id, name: kesRecorded.name }]
	});
	expect(picture('USD').fundsMinor).toBe(2000);
	// Never one combined number across unlike money.
	expect(overview.currencies.some((row) => 'totalMinor' in row)).toBe(false);

	// Another account sees none of it.
	expect(moneyOverview(other, { month: '2026-10' }).currencies).toEqual([]);
	expect(kes.openingMinor).toBe(100000);
	expect(usd.currency).toBe('USD');
});

test('C07: a custody settlement lowers funds and the stock equally, and available is unchanged', () => {
	const first = fixture('EUR', 800000);
	const second = fixture('EUR', 1200000);
	const custody = stocks.createCommitment(ctx, {
		kind: 'custody',
		name: 'Held for Ana',
		currency: 'EUR',
		openingMinor: 600000
	});
	stocks.createCommitment(ctx, {
		kind: 'reserve',
		name: 'Family support earmark',
		currency: 'EUR',
		openingMinor: 300000
	});

	const before = picture('EUR');
	expect(before.fundsMinor).toBe(2000000);
	// 2,000,000 supported − 600,000 custody − 300,000 reserve.
	expect(before.availableMinor).toBe(1100000);
	expect(before.custodyMinor).toBe(600000);

	const offset = line(first.id, '2026-10-02', -100000, 'Owner-approved household payment');
	statements.splitMovement(ctx, {
		id: offset.id,
		allocations: [{ kind: 'custody', amountMinor: -100000, commitmentId: custody.id }]
	});

	const after = picture('EUR');
	expect(after.fundsMinor).toBe(1900000);
	expect(after.custodyMinor).toBe(500000);
	// The claim is not a second subtraction: 1,900,000 − 500,000 − 300,000.
	expect(after.availableMinor).toBe(1100000);
	expect(after.availableMinor).toBe(before.availableMinor);
	expect(second.id).toBeGreaterThan(first.id);
});

test('C07 claims: payables and receivables are separate claims, never subtracted from available', () => {
	const ledger = fixture('AUD', 500000);
	stocks.createCommitment(ctx, {
		kind: 'payable',
		name: 'Owed to the plumber',
		currency: 'AUD',
		openingMinor: 100000
	});
	stocks.createCommitment(ctx, {
		kind: 'receivable',
		name: 'Owed by the neighbour',
		currency: 'AUD',
		openingMinor: 25000
	});

	const picture = moneyOverview(ctx, { month: '2026-10' }).currencies.find(
		(row) => row.currency === 'AUD'
	)!;
	// Neither claim moves available money: 500,000 − 0 custody − 0 reserves.
	expect(picture.availableMinor).toBe(500000);
	expect(picture.payablesMinor).toBe(100000);
	expect(picture.receivablesMinor).toBe(25000);
	expect(picture.custodyMinor).toBe(0);
	expect(picture.reservesMinor).toBe(0);
	expect(ledger.id).toBeGreaterThan(0);
});

test('the month spending excludes transfers, cash and custody, nets refunds, and shows what it left out', () => {
	const ledger = fixture('JPY', 1000000);
	statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });
	line(ledger.id, '2026-09-30', -9999, 'Transport September');
	const expense = line(ledger.id, '2026-10-01', -2500, 'Transport ride');
	const fee = line(ledger.id, '2026-10-02', -500, 'Bank fee');
	statements.updateMovement(ctx, fee.id, { kind: 'fee' });
	const transfer = line(ledger.id, '2026-10-03', -100000, 'Own transfer');
	statements.updateMovement(ctx, transfer.id, { kind: 'transfer' });
	const cash = line(ledger.id, '2026-10-04', -50000, 'Cash withdrawal');
	statements.updateMovement(ctx, cash.id, { kind: 'cash' });
	const mixed = line(ledger.id, '2026-10-05', -30000, 'Custody payment');
	statements.updateMovement(ctx, mixed.id, { kind: 'expense' });
	const custody = stocks.createCommitment(ctx, {
		kind: 'custody',
		name: 'Held for Bea',
		currency: 'JPY',
		openingMinor: 50000
	});
	statements.splitMovement(ctx, {
		id: mixed.id,
		allocations: [{ kind: 'custody', amountMinor: -30000, commitmentId: custody.id }]
	});
	const refund = line(ledger.id, '2026-10-06', 1000, 'Transport refund');
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });

	const spent = picture('JPY').spending;
	expect(spent.grossMinor).toBe(3000);
	expect(spent.refundMinor).toBe(1000);
	expect(spent.netMinor).toBe(2000);
	expect(spent.transferCount).toBe(1);
	expect(spent.transferOutMinor).toBe(100000);
	expect(spent.cashCount).toBe(1);
	expect(spent.cashMinor).toBe(50000);
	expect(spent.custodyCount).toBe(1);
	expect(spent.custodyMinor).toBe(30000);
	expect(spent.unclassifiedCount).toBe(1);
	expect(spent.byCategory).toContainEqual(
		expect.objectContaining({ name: 'Transport', netMinor: 1500 })
	);

	// The budget shares that arithmetic: a refund credit can never make it larger.
	budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Transport',
		currency: 'JPY',
		amountMinor: 600000
	});
	expect(picture('JPY').budgets).toMatchObject([
		{ category: 'Transport', amountMinor: 600000, spentMinor: 1500, remainingMinor: 598500 }
	]);
});

test('a currency with only recorded-only accounts is never labelled available or a balance', () => {
	const recorded = fixture('GBP');
	line(recorded.id, '2026-10-02', 5000, 'Recorded receipt');
	// A declared opening on an account with no currency still has no currency total.
	const unspecified = fixture(null, 700);
	line(unspecified.id, '2026-10-03', -200, 'Unspecified line');

	const pounds = picture('GBP');
	expect(pounds.fundsMinor).toBeNull();
	expect(pounds.availableMinor).toBeNull();
	expect(pounds.recordedOnlyMinor).toBe(5000);
	expect(pounds.gaps).toContainEqual(expect.objectContaining({ kind: 'no-opening', count: 1 }));

	const unnamed = picture(null);
	expect(unnamed.fundsMinor).toBeNull();
	expect(unnamed.availableMinor).toBeNull();
	// No currency total is ever shown, but the movements that happened are not
	// hidden either: recorded movements only, opening excluded (D6).
	expect(unnamed.recordedOnlyMinor).toBe(-200);
	// A declared opening is not enough: without a currency there is no total
	// to call available, and no gap is invented for the opening it has (D6).
	expect(unnamed.coverage).toMatchObject({ accounts: 1, supported: 1 });
	expect(unnamed.gaps).not.toContainEqual(expect.objectContaining({ kind: 'no-opening' }));
});

test('the page load is aggregate: 100001 lines are counted, not listed', () => {
	const ledger = fixture('CHF', 0);
	database.exec(
		`with recursive n(x) as (select 1 union all select x+1 from n where x<100001)
		insert into finance_transactions (user_id,ledger_id,occurred_on,amount_cents,description,source,fingerprint)
		select ?,?,'2026-10-01',-1,'Summary cap test','test','summary-cap-' || x from n`,
		OWNER,
		ledger.id
	);
	const spent = picture('CHF').spending;
	expect(spent.movementCount).toBe(100001);
	expect(spent.grossMinor).toBe(100001);
	expect(spent.netMinor).toBe(100001);
});
