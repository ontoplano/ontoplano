import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const stocks = await import('../src/lib/services/commitments');
const statements = await import('../src/lib/services/statements');
const { createLedger } = await import('../src/lib/services/ledgers');
const { createPerson } = await import('../src/lib/services/people');
const { db } = await import('../src/lib/db');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-18T12:00:00Z') };
const other = { ...ctx, userId: STRANGER };

test('all four stocks retain explicit currency and owner-scoped person without creating bank movements', () => {
	const person = createPerson(ctx, { name: 'Synthetic owner' });
	const personId = typeof person === 'number' ? person : (person as { id: number }).id;
	for (const kind of stocks.COMMITMENT_KINDS) {
		const row = stocks.createCommitment(ctx, {
			kind,
			name: `Synthetic ${kind}`,
			currency: 'KES',
			personId,
			openingMinor: 137600
		});
		expect(row).toMatchObject({
			kind,
			currency: 'KES',
			personName: 'Synthetic owner',
			balanceMinor: 137600,
			entryCount: 0,
			status: 'open'
		});
		expect(() => stocks.getCommitment(other, row.id)).toThrow();
		stocks.updateCommitment(ctx, row.id, { name: 'Renamed', personId: null, notes: 'Kept' });
		expect(stocks.getCommitment(ctx, row.id)).toMatchObject({
			personId: null,
			notes: 'Kept',
			openingMinor: 137600
		});
	}
	expect(statements.listMovements(ctx)).toEqual([]);
	expect(() =>
		stocks.createCommitment(other, {
			kind: 'custody',
			name: 'Wrong person',
			currency: 'KES',
			personId
		})
	).toThrow();
	for (const input of [
		{ openingMinor: -1 },
		{ openingMinor: Number.MAX_SAFE_INTEGER + 1 },
		{ openingMinor: 0.1 },
		{ currency: 'ZZZ' }
	])
		expect(() =>
			stocks.createCommitment(ctx, { name: 'Invalid', kind: 'payable', currency: 'KES', ...input })
		).toThrow();
});

test('dated history, opening corrections and entry reversals cannot make historical money negative or unsafe', () => {
	const stock = stocks.createCommitment(ctx, {
		name: 'History guards',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 500
	});
	const increase = stocks.addCommitmentEntry(ctx, {
		commitmentId: stock.id,
		occurredOn: '2026-10-10',
		amountMinor: 200
	});
	stocks.addCommitmentEntry(ctx, {
		commitmentId: stock.id,
		occurredOn: '2026-10-12',
		amountMinor: -600
	});
	expect(stocks.listCommitmentEntries(ctx, stock.id).map((row) => row.balanceMinor)).toEqual([
		700, 100
	]);
	expect(() => stocks.deleteCommitmentEntry(ctx, increase.id)).toThrow();
	expect(() => stocks.updateCommitment(ctx, stock.id, { openingMinor: 300 })).toThrow();
	expect(() =>
		stocks.addCommitmentEntry(ctx, {
			commitmentId: stock.id,
			occurredOn: '2026-10-09',
			amountMinor: -501
		})
	).toThrow();
	expect(() =>
		stocks.addCommitmentEntry(ctx, {
			commitmentId: stock.id,
			occurredOn: '2026-02-30',
			amountMinor: 1
		})
	).toThrow();
	expect(() =>
		stocks.addCommitmentEntry(ctx, {
			commitmentId: stock.id,
			occurredOn: '2026-10-13',
			amountMinor: Number.MAX_SAFE_INTEGER
		})
	).toThrow();
	expect(stocks.getCommitment(ctx, stock.id).balanceMinor).toBe(100);
	expect(() => stocks.updateCommitment(ctx, stock.id, { currency: 'USD' })).toThrow();
	expect(() => stocks.updateCommitment(ctx, stock.id, { kind: 'reserve' })).toThrow();
});

test('closing locks the opening, and reversing an entry reopens a settled or archived stock', () => {
	const stock = stocks.createCommitment(ctx, {
		name: 'Settled state guard',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 5000
	});
	stocks.closeCommitment(ctx, stock.id, { writeOffNote: 'Synthetic settled-state write-off' });
	const writeOff = stocks.listCommitmentEntries(ctx, stock.id)[0];
	expect(() => stocks.updateCommitment(ctx, stock.id, { openingMinor: 6000 })).toThrow(/reopen/i);
	expect(() =>
		stocks.addCommitmentEntry(ctx, {
			commitmentId: stock.id,
			occurredOn: '2026-10-18',
			amountMinor: 1
		})
	).toThrow(/reopen/i);

	// Reversing the write-off is a history edit, so the settled record reopens.
	stocks.deleteCommitmentEntry(ctx, writeOff.id);
	expect(stocks.getCommitment(ctx, stock.id)).toMatchObject({
		status: 'open',
		balanceMinor: 5000,
		entryCount: 0
	});

	// The same is true of an archived record: Put it back must not dead-end.
	const archived = stocks.createCommitment(ctx, {
		name: 'Archived state guard',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 2000
	});
	const entry = stocks.addCommitmentEntry(ctx, {
		commitmentId: archived.id,
		occurredOn: '2026-10-14',
		amountMinor: -500
	});
	stocks.archiveCommitment(ctx, archived.id, true);
	stocks.deleteCommitmentEntry(ctx, entry.id);
	expect(stocks.getCommitment(ctx, archived.id)).toMatchObject({
		status: 'open',
		balanceMinor: 2000
	});
});

test('close requires explicit residual write-off; history archives and hard-delete requires archived confirmation', () => {
	const stock = stocks.createCommitment(ctx, {
		name: 'Close guard',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: 5000
	});
	expect(() => stocks.closeCommitment(ctx, stock.id)).toThrow();
	stocks.closeCommitment(ctx, stock.id, { writeOffNote: 'Explicit synthetic residual write-off' });
	expect(stocks.getCommitment(ctx, stock.id)).toMatchObject({
		status: 'settled',
		balanceMinor: 0,
		entryCount: 1
	});
	expect(stocks.listCommitments(ctx).some((row) => row.id === stock.id)).toBe(false);
	stocks.archiveCommitment(ctx, stock.id, false);
	stocks.deleteCommitment(ctx, stock.id);
	expect(stocks.getCommitment(ctx, stock.id).status).toBe('archived');
	stocks.archiveCommitment(ctx, stock.id, false);
	expect(() => stocks.deleteCommitment(ctx, stock.id, { permanent: true })).toThrow();
	stocks.archiveCommitment(ctx, stock.id, true);
	stocks.deleteCommitment(ctx, stock.id, { permanent: true });
	expect(() => stocks.getCommitment(ctx, stock.id)).toThrow();
});

test('stock totals are grouped by kind and currency and omit archived stocks', () => {
	for (const openingMinor of [100, 200])
		stocks.createCommitment(ctx, {
			name: `GBP reserve ${openingMinor}`,
			kind: 'reserve',
			currency: 'GBP',
			openingMinor
		});
	const archived = stocks.createCommitment(ctx, {
		name: 'Archived GBP',
		kind: 'reserve',
		currency: 'GBP',
		openingMinor: 500
	});
	stocks.archiveCommitment(ctx, archived.id, true);
	expect(
		stocks.commitmentTotals(ctx).find((row) => row.kind === 'reserve' && row.currency === 'GBP')
	).toMatchObject({ balanceMinor: 300, count: 2 });
	expect(stocks.commitmentTotals(other)).toEqual([]);
});

test('the whole split and stock entry roll back together at a transaction boundary', () => {
	const ledger = createLedger(ctx, { name: 'Atomic stock account', currency: 'KES' });
	const stock = stocks.createCommitment(ctx, {
		name: 'Atomic stock',
		kind: 'custody',
		currency: 'KES',
		openingMinor: 1000
	});
	const line = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-12',
		amountCents: -200,
		description: 'Atomic payment'
	});
	expect(() =>
		db.transaction(() => {
			stocks.settleCommitment(ctx, { commitmentId: stock.id, transactionId: line.id });
			throw new Error('rollback this transaction');
		})
	).toThrow('rollback this transaction');
	expect(stocks.getCommitment(ctx, stock.id).balanceMinor).toBe(1000);
	expect(statements.listMovements(ctx, { ledgerId: ledger.id })[0].allocations).toEqual([]);
});

test('manual linked entry cannot reuse a reserve expense or receivable repayment on another stock', () => {
	const ledger = createLedger(ctx, { name: 'No double use', currency: 'KES' });
	for (const kind of ['reserve', 'receivable'] as const) {
		const first = stocks.createCommitment(ctx, {
			name: `First ${kind}`,
			kind,
			currency: 'KES',
			openingMinor: 1000
		});
		const second = stocks.createCommitment(ctx, {
			name: `Second ${kind}`,
			kind,
			currency: 'KES',
			openingMinor: 1000
		});
		const line = statements.recordMovement(ctx, {
			ledgerId: ledger.id,
			occurredOn: '2026-10-12',
			amountCents: kind === 'reserve' ? -100 : 100,
			description: `One ${kind} movement`
		});
		(kind === 'reserve' ? stocks.consumeReserve : stocks.settleCommitment)(ctx, {
			commitmentId: first.id,
			transactionId: line.id
		});
		expect(() =>
			stocks.addCommitmentEntry(ctx, {
				commitmentId: second.id,
				transactionId: line.id,
				occurredOn: '2026-10-12',
				amountMinor: -100
			})
		).toThrow();
		expect(stocks.getCommitment(ctx, second.id).balanceMinor).toBe(1000);
	}
});

test('a repeated settlement is a conflict and overpayment names the outstanding balance', () => {
	const ledger = createLedger(ctx, { name: 'Conflict account', currency: 'KES' });
	const stock = stocks.createCommitment(ctx, {
		name: 'Conflict stock',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 1000
	});
	const line = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-12',
		amountCents: -100,
		description: 'Settle once'
	});
	stocks.settleCommitment(ctx, { commitmentId: stock.id, transactionId: line.id });
	try {
		stocks.settleCommitment(ctx, { commitmentId: stock.id, transactionId: line.id });
		throw new Error('settled twice');
	} catch (error) {
		expect(error).toMatchObject({ code: 'conflict' });
	}
	const overpay = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-12',
		amountCents: -901,
		description: 'Too much'
	});
	expect(() =>
		stocks.settleCommitment(ctx, { commitmentId: stock.id, transactionId: overpay.id })
	).toThrow(/900.*KES/);
});

test('account export/import remaps stock, person, movement and allocation links; deletion leaves the other owner intact', async () => {
	const { collectAccount, deleteAccount, unaccountedTables } =
		await import('../src/lib/services/account-data');
	const { importAccount } = await import('../src/lib/services/account-import');
	const ledger = createLedger(ctx, { name: 'Portable split ledger', currency: 'KES' });
	const stock = stocks.createCommitment(ctx, {
		name: 'Portable stock',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 1000
	});
	const line = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-12',
		amountCents: -100,
		description: 'Portable split'
	});
	stocks.settleCommitment(ctx, { commitmentId: stock.id, transactionId: line.id });
	expect(unaccountedTables()).toEqual([]);
	const file = collectAccount(OWNER, ctx.now);
	await importAccount(STRANGER, file);
	const restored = stocks.listCommitments(other).find((row) => row.name === 'Portable stock')!;
	expect(restored.id).not.toBe(stock.id);
	expect(restored.balanceMinor).toBe(900);
	const entry = stocks.listCommitmentEntries(other, restored.id)[0];
	expect(entry.transactionId).not.toBe(line.id);
	expect(statements.getMovementRow(other, entry.transactionId!)?.allocations[0].commitmentId).toBe(
		restored.id
	);
	deleteAccount(STRANGER);
	expect(
		database.get('select count(*) as n from finance_commitment_entries where user_id = ?', STRANGER)
	).toEqual({ n: 0 });
	expect(stocks.getCommitment(ctx, stock.id).balanceMinor).toBe(900);
});
