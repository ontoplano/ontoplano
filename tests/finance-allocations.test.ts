import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgerService = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const stocks = await import('../src/lib/services/commitments');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-18T12:00:00Z') };
let counter = 0;
function fixture(amount = -250000, opening = 10000, currency = 'KES') {
	const ledger = ledgerService.createLedger(ctx, {
		name: `Allocation ${++counter}`,
		currency,
		openingOn: '2026-10-01',
		openingMinor: 1000000
	});
	const commitment = stocks.createCommitment(ctx, {
		name: `Payable ${counter}`,
		kind: 'payable',
		currency,
		openingMinor: opening
	});
	const movement = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-17',
		amountCents: amount,
		description: `Mixed payment ${counter}`
	});
	return { ledger, commitment, movement };
}

test('a mixed movement conserves bank truth and atomically offsets only its custody share', () => {
	const { ledger, commitment, movement } = fixture();
	const before = ledgerService.getLedger(ctx, ledger.id).supportedMinor;
	statements.splitMovement(ctx, {
		id: movement.id,
		allocations: [
			{ kind: 'personal', amountMinor: -247500, category: 'Household' },
			{
				kind: 'custody',
				amountMinor: -2500,
				commitmentId: commitment.id,
				note: 'Owner-approved offset'
			}
		]
	});
	expect(ledgerService.getLedger(ctx, ledger.id).supportedMinor).toBe(before);
	expect(stocks.getCommitment(ctx, commitment.id).balanceMinor).toBe(7500);
	expect(stocks.listCommitmentEntries(ctx, commitment.id)).toMatchObject([
		{ amountMinor: -2500, transactionId: movement.id }
	]);
	expect(statements.listMovements(ctx, { ledgerId: ledger.id })[0].allocations).toHaveLength(2);
	const row = statements
		.listMovements(ctx, { ledgerId: ledger.id })
		.find((r) => r.id === movement.id)!;
	// The split's own category is the category every screen shows, not only the chart.
	expect(row).toMatchObject({ category: 'Household', commitmentEntryId: expect.any(Number) });
	expect(row.commitmentEntryId).toBeGreaterThan(0);
	expect(statements.uncategorizedCount(ctx, { ledgerId: ledger.id })).toBe(0);
	expect(statements.categorySlices(ctx, { ledgerId: ledger.id })).toMatchObject([
		{ name: 'Household', outCents: 247500 }
	]);
});

test('invalid sum, sign, currency, kind and owner all leave no partial allocations or entries', () => {
	const { ledger, commitment, movement } = fixture(-1000);
	const foreign = stocks.createCommitment(
		{ ...ctx, userId: STRANGER },
		{ name: 'Other custody', kind: 'custody', currency: 'KES' }
	);
	const wrongCurrency = stocks.createCommitment(ctx, {
		name: 'Foreign currency',
		kind: 'custody',
		currency: 'USD'
	});
	const reserve = stocks.createCommitment(ctx, {
		name: 'Not custody',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 10000
	});
	const split = (allocations: Record<string, unknown>[]) => () =>
		statements.splitMovement(ctx, { id: movement.id, allocations });
	expect(split([{ kind: 'personal', amountMinor: -999 }])).toThrow(/difference|add|sum|1000/i);
	expect(
		split([
			{ kind: 'personal', amountMinor: 100 },
			{ kind: 'custody', amountMinor: -1100, commitmentId: commitment.id }
		])
	).toThrow();
	for (const id of [foreign.id, wrongCurrency.id, reserve.id]) {
		expect(split([{ kind: 'custody', amountMinor: -1000, commitmentId: id }])).toThrow();
	}
	expect(split([{ kind: 'custody', amountMinor: -1000 }])).toThrow();
	expect(statements.listMovements(ctx, { ledgerId: ledger.id })[0].allocations).toEqual([]);
	expect(stocks.listCommitmentEntries(ctx, commitment.id)).toEqual([]);
});

test('retained evidence blocks mutation and deletion; reverse the entry then unsplit explicitly', () => {
	const { ledger, commitment, movement } = fixture(-500);
	statements.splitMovement(ctx, {
		id: movement.id,
		allocations: [{ kind: 'custody', amountMinor: -500, commitmentId: commitment.id }]
	});
	for (const input of [{ amountCents: -501 }, { occurredOn: '2026-10-16' }, { kind: 'cash' }])
		expect(() => statements.updateMovement(ctx, movement.id, input)).toThrow(
			/split|entry|settle|evidence/i
		);
	expect(() =>
		statements.classifyMovements(ctx, { ids: [movement.id], kind: 'transfer' })
	).toThrow();
	expect(() => statements.deleteMovement(ctx, movement.id)).toThrow();
	expect(() => ledgerService.deleteLedger(ctx, ledger.id)).toThrow(new RegExp(String(movement.id)));
	expect(() => statements.unsplitMovement(ctx, movement.id)).toThrow();
	stocks.deleteCommitmentEntry(ctx, stocks.listCommitmentEntries(ctx, commitment.id)[0].id);
	statements.unsplitMovement(ctx, movement.id);
	expect(stocks.getCommitment(ctx, commitment.id).balanceMinor).toBe(10000);
	statements.deleteMovement(ctx, movement.id);
	ledgerService.deleteLedger(ctx, ledger.id);
});

test('whole payment offsets exclude spending, but reserve consumption keeps the real expense once', () => {
	const { ledger, commitment, movement } = fixture(-3000);
	stocks.settleCommitment(ctx, { commitmentId: commitment.id, transactionId: movement.id });
	expect(stocks.getCommitment(ctx, commitment.id).balanceMinor).toBe(7000);
	expect(statements.categorySlices(ctx, { ledgerId: ledger.id })).toEqual([]);
	expect(() =>
		stocks.settleCommitment(ctx, { commitmentId: commitment.id, transactionId: movement.id })
	).toThrow();
	const expense = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-17',
		amountCents: -2000,
		description: 'Family support'
	});
	const reserve = stocks.createCommitment(ctx, {
		name: 'Family reserve',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 5000
	});
	stocks.consumeReserve(ctx, { commitmentId: reserve.id, transactionId: expense.id });
	expect(stocks.getCommitment(ctx, reserve.id).balanceMinor).toBe(3000);
	expect(
		statements.categorySlices(ctx, { ledgerId: ledger.id }).reduce((n, r) => n + r.outCents, 0)
	).toBe(2000);
	expect(() => statements.deleteMovement(ctx, expense.id)).toThrow();
	expect(() =>
		stocks.consumeReserve(ctx, { commitmentId: reserve.id, transactionId: expense.id })
	).toThrow();
});

test('partial and competing settlements cannot overspend a commitment or change history on failure', () => {
	const { ledger, commitment, movement } = fixture(-7000);
	const second = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-17',
		amountCents: -7000,
		description: 'Competing settlement'
	});
	stocks.settleCommitment(ctx, { commitmentId: commitment.id, transactionId: movement.id });
	expect(() =>
		stocks.settleCommitment(ctx, { commitmentId: commitment.id, transactionId: second.id })
	).toThrow();
	expect(stocks.getCommitment(ctx, commitment.id).balanceMinor).toBe(3000);
	expect(stocks.listCommitmentEntries(ctx, commitment.id)).toHaveLength(1);
	expect(
		statements.listMovements(ctx, { ledgerId: ledger.id }).find((r) => r.id === second.id)
			?.allocations
	).toEqual([]);
});

test('custody parts for one stock become one entry, and a split line still accepts a refund link', () => {
	const { ledger, commitment, movement } = fixture(-1000, 10000);
	const long = 'x'.repeat(1500);
	expect(() =>
		statements.splitMovement(ctx, {
			id: movement.id,
			allocations: [
				{ kind: 'custody', amountMinor: -400, commitmentId: commitment.id, note: long },
				{ kind: 'custody', amountMinor: -600, commitmentId: commitment.id, note: long }
			]
		})
	).toThrow(/combined note/i);
	expect(statements.listMovements(ctx, { ledgerId: ledger.id })[0].allocations).toEqual([]);

	statements.splitMovement(ctx, {
		id: movement.id,
		allocations: [
			{ kind: 'custody', amountMinor: -400, commitmentId: commitment.id, note: 'first' },
			{ kind: 'custody', amountMinor: -600, commitmentId: commitment.id, note: 'second' }
		]
	});
	const entries = stocks.listCommitmentEntries(ctx, commitment.id);
	expect(entries).toHaveLength(1);
	expect(entries[0]).toMatchObject({ amountMinor: -1000, note: 'first\nsecond' });

	const credit = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-18',
		amountCents: 100,
		description: 'Refund back'
	});
	// Only the child changes when a refund is linked; a split or a settled parent
	// must not block that.
	expect(() =>
		statements.linkMovement(ctx, { id: credit.id, parentId: movement.id, relation: 'refund' })
	).not.toThrow();
	expect(
		statements.listMovements(ctx, { ledgerId: ledger.id }).find((r) => r.id === credit.id)?.kind
	).toBe('refund');
});

test('personal spending nets refunds and leaves cash and transfer lines to the cash-flow totals', () => {
	const ledger = ledgerService.createLedger(ctx, {
		name: `Refund spending ${++counter}`,
		currency: 'KES'
	});
	const expense = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-05',
		amountCents: -10000,
		description: 'Shop expense'
	});
	const refund = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-06',
		amountCents: 4000,
		description: 'Shop refund'
	});
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });
	const slices = statements.categorySlices(ctx, { ledgerId: ledger.id });
	expect(slices.reduce((n, slice) => n + slice.outCents, 0)).toBe(6000);
	expect(slices.every((slice) => slice.outCents > 0 && slice.share > 0 && slice.share <= 1)).toBe(
		true
	);

	const cash = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-07',
		amountCents: -700,
		description: 'ATM'
	});
	statements.classifyMovements(ctx, { ids: [cash.id], kind: 'cash' });
	const transfer = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-08',
		amountCents: -500,
		description: 'Move between accounts'
	});
	statements.classifyMovements(ctx, { ids: [transfer.id], kind: 'transfer' });
	expect(
		statements
			.categorySlices(ctx, { ledgerId: ledger.id })
			.reduce((n, slice) => n + slice.outCents, 0)
	).toBe(6000);

	// Cash flow keeps what personal spending leaves out: the refund arrived,
	// and the cash and transfer lines left the account.
	const month = statements
		.monthlyTotals(ctx, 12, { ledgerId: ledger.id })
		.find((row) => row.month === '2026-10');
	expect(month).toMatchObject({ inCents: 4000, outCents: 11200 });
});

test('a refund-only ledger shows no spending slice, while its month still shows the refund arriving', () => {
	const original = ledgerService.createLedger(ctx, {
		name: `Original expense ${++counter}`,
		currency: 'KES'
	});
	const expense = statements.recordMovement(ctx, {
		ledgerId: original.id,
		occurredOn: '2026-09-02',
		amountCents: -5000,
		description: 'Earlier purchase'
	});
	const card = ledgerService.createLedger(ctx, {
		name: `Refund only ${++counter}`,
		currency: 'KES'
	});
	const refund = statements.recordMovement(ctx, {
		ledgerId: card.id,
		occurredOn: '2026-10-09',
		amountCents: 2000,
		description: 'Refund to card'
	});
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });
	expect(statements.categorySlices(ctx, { ledgerId: card.id })).toEqual([]);
	const month = statements
		.monthlyTotals(ctx, 12, { ledgerId: card.id })
		.find((row) => row.month === '2026-10');
	expect(month).toMatchObject({ inCents: 2000, outCents: 0 });
});
