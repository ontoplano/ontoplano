import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';
import { refusal } from './helpers/refusal';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const statements = await import('../src/lib/services/statements');
const ledgers = await import('../src/lib/services/ledgers');
const stocks = await import('../src/lib/services/commitments');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };
let sequence = 0;
function fixture(currency: string | null = 'KES') {
	return ledgers.createLedger(ctx, { name: `Spending ${++sequence}`, currency });
}
function line(ledgerId: number, occurredOn: string, amountCents: number, kind?: string) {
	const row = statements.recordMovement(ctx, {
		ledgerId,
		occurredOn,
		amountCents,
		description: `Transport ride ${++sequence}`
	});
	if (kind) statements.updateMovement(ctx, row.id, { kind });
	return row;
}
statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });
statements.createRule(ctx, { kind: 'tag', name: 'travel', pattern: 'Transport' });

test('every series uses the exact inclusive chosen window, not the clock or all history', () => {
	const ledger = fixture();
	for (const [day, amount] of [
		['2026-06-30', -100],
		['2026-07-01', -200],
		['2026-09-30', -300],
		['2026-10-01', -400]
	] as const)
		line(ledger.id, day, amount);
	const filter = { ledgerId: ledger.id, from: '2026-07-01', to: '2026-09-30' };
	const totals = statements.monthlyTotals(ctx, 3, filter);
	expect(totals.map((row) => row.month)).toEqual(['2026-07', '2026-08', '2026-09']);
	expect(totals.reduce((sum, row) => sum + row.outCents, 0)).toBe(500);
	expect(statements.categoryMonths(ctx, 3, filter)).toMatchObject({
		months: totals.map((row) => row.month),
		categories: [{ totalCents: 500 }]
	});
	expect(statements.categorySlices(ctx, filter)).toMatchObject([{ outCents: 500 }]);
	expect(statements.tagMonths(ctx, 'travel', 3, filter)).toMatchObject({
		months: totals.map((row) => row.month),
		totalCents: 500
	});
	const four = { ...filter, from: '2026-06-01' };
	expect(statements.categorySlices(ctx, four)[0].outCents).toBe(600);
});

test('spending nets refunds, excludes transfers, cash and custody, and names assumed expenses', () => {
	const ledger = fixture();
	const other = fixture();
	const expense = line(ledger.id, '2026-10-01', -120000, 'expense');
	const refund = line(ledger.id, '2026-10-02', 40000, 'refund');
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });
	const outgoing = line(ledger.id, '2026-10-03', -250000, 'transfer');
	const incoming = line(other.id, '2026-10-03', 250000, 'transfer');
	statements.linkTransfer(ctx, { id: outgoing.id, counterpartId: incoming.id });
	line(ledger.id, '2026-10-04', -500000, 'cash');
	line(ledger.id, '2026-10-05', -1000);
	const custody = stocks.createCommitment(ctx, {
		name: 'Shared trip',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 10000
	});
	const mixed = line(ledger.id, '2026-10-06', -3000, 'expense');
	statements.splitMovement(ctx, {
		id: mixed.id,
		allocations: [
			{ kind: 'personal', amountMinor: -1000, category: 'Transport' },
			{ kind: 'custody', amountMinor: -2000, commitmentId: custody.id }
		]
	});
	expect(statements.spending(ctx, { month: '2026-10', ledgerId: ledger.id })).toMatchObject([
		{
			currency: 'KES',
			grossMinor: 122000,
			refundMinor: 40000,
			netMinor: 82000,
			incomeMinor: 0,
			movementCount: 6,
			unclassifiedCount: 1,
			transferCount: 1,
			transferOutMinor: 250000,
			transferInMinor: 0,
			cashCount: 1,
			cashMinor: 500000,
			custodyCount: 1,
			custodyMinor: 2000,
			byCategory: [{ name: 'Transport', grossMinor: 122000, refundMinor: 40000, netMinor: 82000 }]
		}
	]);
	expect(statements.spending({ ...ctx, userId: STRANGER }, { month: '2026-10' })).toEqual([]);
	expect(statements.listMovements(ctx, { ledgerId: ledger.id })).toHaveLength(6);
});

test('currencies remain separate and single-series charts refuse a combined figure', () => {
	const owner = { ...ctx, userId: STRANGER };
	const kes = ledgers.createLedger(owner, { name: 'Shillings', currency: 'KES' });
	const usd = ledgers.createLedger(owner, { name: 'Dollars', currency: 'USD' });
	for (const ledgerId of [kes.id, usd.id]) {
		const movement = statements.recordMovement(owner, {
			ledgerId,
			occurredOn: '2026-10-01',
			amountCents: -100,
			description: 'Independent money'
		});
		statements.updateMovement(owner, movement.id, { kind: 'transfer' });
	}
	expect(statements.spending(owner, { month: '2026-10' })).toMatchObject([
		{ currency: 'KES', netMinor: 0, transferOutMinor: 100 },
		{ currency: 'USD', netMinor: 0, transferOutMinor: 100 }
	]);
	expect(refusal(() => statements.monthlyTotals(owner, 12))).toMatch(/one.*currency/i);
	expect(refusal(() => statements.categorySlices(owner))).toMatch(/one.*currency/i);
	expect(refusal(() => statements.categoryMonths(owner))).toMatch(/one.*currency/i);
	expect(refusal(() => statements.tagMonths(owner, 'travel'))).toMatch(/one.*currency/i);
	expect(statements.monthlyTotals(owner, 1, { currency: 'KES' })[0].outCents).toBe(100);
});

test('the unclassified drill-down keeps the report currency and inclusive window across ledgers', () => {
	const first = fixture();
	const second = fixture();
	const usd = fixture('USD');
	line(first.id, '2026-08-31', -100);
	const a = line(first.id, '2026-09-01', -200);
	const b = line(second.id, '2026-09-30', -300);
	line(second.id, '2026-09-30', -400, 'expense');
	line(usd.id, '2026-09-01', -500);
	line(first.id, '2026-10-01', -600);
	expect(
		statements
			.listMovements(ctx, { ledgerId: first.id, month: '2026-09', limit: 1 })
			.map((row) => row.id)
	).toEqual([a.id]);
	expect(
		statements
			.listMovements(ctx, {
				currency: 'KES',
				from: '2026-09-01',
				to: '2026-09-30',
				unclassified: true
			})
			.filter((row) => [first.id, second.id, usd.id].includes(row.ledgerId!))
			.map((row) => row.id)
			.sort()
	).toEqual([a.id, b.id].sort());
});

test('a refund alone stays a dated credit under its parent split category, never income', () => {
	const ledger = fixture();
	const expense = line(ledger.id, '2026-09-01', -120000, 'expense');
	statements.splitMovement(ctx, {
		id: expense.id,
		allocations: [{ kind: 'personal', category: 'Supplies', amountMinor: -120000 }]
	});
	const refund = line(ledger.id, '2026-10-02', 40000, 'refund');
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });
	expect(statements.spending(ctx, { ledgerId: ledger.id, month: '2026-10' })).toMatchObject([
		{
			grossMinor: 0,
			refundMinor: 40000,
			netMinor: -40000,
			incomeMinor: 0,
			unmatchedRefundCount: 0,
			byCategory: [{ name: 'Supplies', grossMinor: 0, refundMinor: 40000, netMinor: -40000 }]
		}
	]);
	line(ledger.id, '2026-10-03', 1000, 'refund');
	expect(
		statements.spending(ctx, { ledgerId: ledger.id, month: '2026-10' })[0].unmatchedRefundCount
	).toBe(1);
	expect(statements.spending(ctx, { ledgerId: ledger.id, month: '2026-11' })).toEqual([]);
});

test('the default is twelve civil months; invalid or unbounded windows are refused', () => {
	const local = { ...ctx, now: new Date('2026-10-31T22:30:00Z'), tz: 'Africa/Nairobi' };
	expect(statements.statementWindow(local).months).toEqual(
		statements.monthKeys(new Date('2026-11-01T12:00:00Z'), 12)
	);
	expect(statements.statementWindow(ctx, 4, { month: '2026-02' })).toMatchObject({
		from: '2026-02-01',
		to: '2026-02-28',
		months: ['2026-02']
	});
	for (const filter of [
		{ month: '2026-13' },
		{ from: '2026-02-30' },
		{ from: '2026-10-01', to: '2026-09-30' },
		{ from: '2000-01-01' }
	])
		expect(() => statements.statementWindow(ctx, 12, filter)).toThrow();
	for (const months of [0, -1, 1.5, Infinity, 121])
		expect(() => statements.statementWindow(ctx, months)).toThrow();
});

test('cash flow aggregates beyond the movement-list cap without evaluating every row', () => {
	const ledger = fixture();
	database.exec(
		`with recursive n(x) as (select 1 union all select x+1 from n where x<100001)
		insert into finance_transactions (user_id,ledger_id,occurred_on,amount_cents,description,source,fingerprint)
		select ?,?,'2026-10-01',-1,'Transport cap test','test','cap-' || x from n`,
		OWNER,
		ledger.id
	);
	expect(statements.monthlyTotals(ctx, 1, { ledgerId: ledger.id })[0].outCents).toBe(100001);
	expect(statements.spending(ctx, { month: '2026-10', ledgerId: ledger.id })[0]).toMatchObject({
		grossMinor: 100001,
		movementCount: 100001
	});
});

test('the default category window excludes old history and future months just like monthly series', () => {
	const ledger = fixture();
	line(ledger.id, '2025-10-31', -900);
	line(ledger.id, '2025-11-01', -100);
	line(ledger.id, '2026-10-31', -200);
	line(ledger.id, '2026-11-01', -800);
	const filter = { ledgerId: ledger.id };
	expect(statements.categorySlices(ctx, filter)[0].outCents).toBe(300);
	expect(statements.categoryMonths(ctx, 12, filter).categories[0].totalCents).toBe(300);
	expect(statements.tagMonths(ctx, 'travel', 12, filter).totalCents).toBe(300);
});
