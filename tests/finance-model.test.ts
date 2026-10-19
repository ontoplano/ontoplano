/**
 * Story 5.4 — the acceptance fixtures through the real services.
 *
 * One test per case C01–C12 of planning/finance/acceptance-fixtures.json. The
 * numbers below are that file's (planning/ is gitignored local context, so the
 * committed suite carries the values it proves instead of reading them at run
 * time). Each case gets its own synthetic account so a total the services
 * compute across the account — funds, spending, commitment totals — is the
 * case's own arithmetic and nothing earlier in this file.
 *
 * Synthetic amounts only. No network, no live financial record.
 */
import { afterAll, expect, test } from 'vitest';
import { makeDatabase, seedAccounts } from './helpers/db';
import { refusal } from './helpers/refusal';
import type { Ctx } from '../src/lib/services/ctx';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const commitments = await import('../src/lib/services/commitments');
const budgets = await import('../src/lib/services/budgets');
const summary = await import('../src/lib/services/finance-summary');

const NOW = new Date('2026-10-19T12:00:00Z');

/** Transcribed from planning/finance/acceptance-fixtures.json. Read-only input. */
const C = {
	C01: {
		movementsMinor: [-250000, 250000, -2500],
		expected: {
			personalSpendingMinor: 2500,
			netBankChangeMinor: -2500,
			transferSpendingMinor: 0
		}
	},
	C02: {
		receiptMinor: 1000000,
		custodyMinor: 970000,
		personalIncomeMinor: 30000,
		expenseMinor: 199000,
		feeMinor: 1000,
		expected: {
			payableAfterReceiptMinor: 970000,
			payableAfterOffsetMinor: 770000,
			finalSettlementMinor: 770000,
			payableAfterSettlementMinor: 0,
			personalIncomeMinor: 30000,
			personalSpendingMinor: 0,
			retainedFundsMinor: 30000
		}
	},
	C03: {
		budgetMinor: 600000,
		reserveBeforeMinor: 400000,
		paymentMinor: 250000,
		expected: {
			spendingBeforePaymentMinor: 0,
			spendingAfterPaymentMinor: 250000,
			budgetRemainingMinor: 350000,
			reserveAfterConsumptionMinor: 150000,
			recordedPaymentCount: 1
		}
	},
	C04: {
		expenseMinor: 120000,
		refundMinor: 40000,
		expected: {
			grossExpensesMinor: 120000,
			refundsMinor: 40000,
			netPersonalSpendingMinor: 80000,
			personalIncomeMinor: 0
		}
	},
	C05: {
		bankOutflowMinor: 500000,
		expected: {
			personalSpendingMinor: 0,
			unresolvedCashMovementMinor: 500000,
			inventedCashCounterparts: 0
		}
	},
	C06: {
		source: { currency: 'KES', minor: -260000 },
		destination: { currency: 'USD', minor: 2000 },
		expected: {
			personalSpendingMinorByCurrency: { KES: 0, USD: 0 },
			combinedCrossCurrencyTotal: null,
			inventedFxOrFeeEntries: 0
		}
	},
	C07: {
		supportedLiquidBalancesMinor: [800000, 1200000],
		custodyPayableMinor: 600000,
		personalReservesMinor: 300000,
		ownerApprovedOffsetMinor: 100000,
		expected: {
			supportedFundsBeforeMinor: 2000000,
			fundsAfterCommitmentsBeforeMinor: 1100000,
			supportedFundsAfterMinor: 1900000,
			payableAfterMinor: 500000,
			fundsAfterCommitmentsAfterMinor: 1100000
		}
	},
	C08: {
		recordedNetMinor: 2500,
		observedBalanceMinor: 2100,
		openingKnown: false,
		expected: {
			unexplainedDifferenceMinor: -400,
			automaticAdjustmentEntries: 0,
			balanceStatus: 'unreconciled',
			certifiedAvailableFunds: null
		}
	},
	C09: {
		syntheticSourceIds: ['fixture-a', 'fixture-b', 'fixture-c'],
		expected: {
			firstImportAdded: 3,
			secondImportAdded: 0,
			secondImportSkipped: 3,
			preservedClassifications: true,
			preservedLinks: true,
			preservedSourceFields: true
		}
	},
	C10: {
		expense: { date: '2026-02-25', minor: 120000 },
		refund: { date: '2026-03-03', minor: 40000 },
		expected: {
			februaryNetSpendingMinor: 120000,
			marchGrossExpensesMinor: 0,
			marchRefundsMinor: 40000,
			marchNetSpendingMinor: -40000,
			silentlyRewrittenFebruaryAmounts: 0
		}
	},
	C11: {
		outstandingMinor: 100000,
		concurrentSettlementRequestsMinor: [100000, 100000],
		expected: {
			successfulSettlements: 1,
			secondResult: 'conflict',
			outstandingMinor: 0,
			duplicateBankMovements: 0
		}
	},
	C12: {
		requestOwner: 'synthetic-user-a',
		referencedRowOwner: 'synthetic-user-b',
		expected: { result: 'same_as_missing', changedRows: 0, leakedForeignFields: 0 }
	}
} as const;

let userSequence = 0;

/** A synthetic account of its own, so aggregate queries belong to one case. */
function fixtureUser(label: string): Ctx {
	const userId = `fixture-${label}-${++userSequence}`;
	database.exec(
		`insert into user (id, name, email, email_verified, created_at, updated_at)
		 values (?, ?, ?, 0, '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
		userId,
		`Synthetic ${label}`,
		`${userId}@test.invalid`
	);
	return { userId, tz: 'UTC', now: NOW };
}

function ledger(ctx: Ctx, name: string, currency = 'KES', openingMinor = 0) {
	return ledgers.createLedger(ctx, {
		name,
		currency,
		openingOn: '2026-10-01',
		openingMinor
	});
}

function line(
	ctx: Ctx,
	ledgerId: number,
	occurredOn: string,
	amountCents: number,
	description: string
): number {
	return statements.recordMovement(ctx, {
		ledgerId,
		occurredOn,
		amountCents,
		description
	}).id;
}

function funds(ctx: Ctx, currency: string): number | null {
	return ledgers.supported(ctx).find((row) => row.currency === currency)?.supportedMinor ?? null;
}

function stockBalance(
	ctx: Ctx,
	kind: 'custody' | 'payable' | 'receivable' | 'reserve',
	currency: string
) {
	return (
		commitments.commitmentTotals(ctx).find((row) => row.kind === kind && row.currency === currency)
			?.balanceMinor ?? 0
	);
}

/** C07's "available" from architecture §4: funds − custody − reserves. */
function available(ctx: Ctx, currency: string) {
	const supported = funds(ctx, currency) ?? 0;
	const custody = stockBalance(ctx, 'custody', currency);
	const reserves = stockBalance(ctx, 'reserve', currency);
	return { supported, custody, reserves, available: supported - custody - reserves };
}

test('C01 — transfer plus supported fee: personal spending 2500, balances change only by the fee', () => {
	const ctx = fixtureUser('c01');
	const [outMinor, inMinor, feeMinor] = C.C01.movementsMinor;
	const source = ledger(ctx, 'C01 source', 'KES', 1000000);
	const destination = ledger(ctx, 'C01 destination', 'KES', 1000000);
	const before = funds(ctx, 'KES');

	const outgoing = line(ctx, source.id, '2026-10-02', outMinor, 'Move own money');
	const incoming = line(ctx, destination.id, '2026-10-02', inMinor, 'Move own money');
	const fee = line(ctx, source.id, '2026-10-02', feeMinor, 'Transfer fee');
	statements.linkTransfer(ctx, { id: outgoing, counterpartId: incoming });
	statements.classifyMovements(ctx, { ids: [fee], kind: 'fee' });

	const [spending] = statements.spending(ctx, { month: '2026-10' });
	expect(spending).toMatchObject({
		currency: 'KES',
		netMinor: C.C01.expected.personalSpendingMinor,
		transferOutMinor: -outMinor,
		transferInMinor: inMinor,
		incomeMinor: 0
	});
	// The transfer legs net to nothing and do not enter spending; the supported
	// fee is the whole personal figure.
	expect(spending.transferInMinor - spending.transferOutMinor).toBe(
		C.C01.expected.transferSpendingMinor
	);
	expect(spending.netMinor).toBe(C.C01.expected.personalSpendingMinor);
	expect(spending.byCategory.reduce((sum, row) => sum + row.netMinor, 0)).toBe(
		C.C01.expected.personalSpendingMinor
	);

	const after = funds(ctx, 'KES')!;
	expect(before).toBe(2_000_000);
	expect(after - before!).toBe(C.C01.expected.netBankChangeMinor);
	expect(ledgers.getLedger(ctx, source.id).supportedMinor).toBe(1000000 + outMinor + feeMinor);
	expect(ledgers.getLedger(ctx, destination.id).supportedMinor).toBe(1000000 + inMinor);
});

test('C02 — mixed custody receipt splits, offset reduces the payable, spending stays 0, settlement to 0', () => {
	const ctx = fixtureUser('c02');
	const account = ledger(ctx, 'C02 account', 'KES', 0);
	const payable = commitments.createCommitment(ctx, {
		name: 'C02 custody payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 0
	});

	// The receipt is mixed: the custody share is money held for someone, the
	// personal share is real income. Neither part invents a bank line.
	const receipt = line(ctx, account.id, '2026-10-02', C.C02.receiptMinor, 'Custody receipt');
	statements.splitMovement(ctx, {
		id: receipt,
		allocations: [
			{ kind: 'custody', amountMinor: C.C02.custodyMinor, commitmentId: payable.id },
			{ kind: 'personal', amountMinor: C.C02.personalIncomeMinor }
		]
	});
	expect(commitments.getCommitment(ctx, payable.id).balanceMinor).toBe(
		C.C02.expected.payableAfterReceiptMinor
	);

	// The owner approves the hospital expense plus its fee as an offset.
	const expense = line(ctx, account.id, '2026-10-05', -C.C02.expenseMinor, 'Hospital offset');
	const fee = line(ctx, account.id, '2026-10-05', -C.C02.feeMinor, 'Hospital offset fee');
	commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: expense });
	commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: fee });
	expect(commitments.getCommitment(ctx, payable.id).balanceMinor).toBe(
		C.C02.expected.payableAfterOffsetMinor
	);

	// The final settlement is the remaining payable, to the minor unit.
	const settlement = line(
		ctx,
		account.id,
		'2026-10-06',
		-C.C02.expected.finalSettlementMinor,
		'Final custody settlement'
	);
	commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: settlement });
	expect(commitments.getCommitment(ctx, payable.id).balanceMinor).toBe(
		C.C02.expected.payableAfterSettlementMinor
	);

	const [spending] = statements.spending(ctx, { month: '2026-10' });
	expect(spending).toMatchObject({
		currency: 'KES',
		netMinor: C.C02.expected.personalSpendingMinor,
		incomeMinor: C.C02.expected.personalIncomeMinor
	});
	// What the account kept after every custody movement: the personal income.
	expect(ledgers.getLedger(ctx, account.id).supportedMinor).toBe(C.C02.expected.retainedFundsMinor);
});

test('C03 — a budget and a reserve spend nothing; the real payment spends once and consumes the reserve once', () => {
	const ctx = fixtureUser('c03');
	const account = ledger(ctx, 'C03 account', 'KES', 1000000);
	statements.createRule(ctx, { kind: 'category', name: 'Support', pattern: 'Support' });
	const reserve = commitments.createCommitment(ctx, {
		name: 'C03 reserve',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: C.C03.reserveBeforeMinor
	});
	const budget = budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Support',
		currency: 'KES',
		amountMinor: C.C03.budgetMinor
	});

	// Setting a ceiling and earmarking money moves no bank line.
	expect(statements.spending(ctx, { month: '2026-10' })).toEqual([]);
	expect(statements.listMovements(ctx)).toEqual([]);
	expect(ledgers.getLedger(ctx, account.id).supportedMinor).toBe(1000000);
	expect(budgets.getBudget(ctx, budget.id)).toMatchObject({
		spentMinor: C.C03.expected.spendingBeforePaymentMinor,
		remainingMinor: C.C03.budgetMinor
	});

	const payment = line(ctx, account.id, '2026-10-05', -C.C03.paymentMinor, 'Support payment');
	commitments.consumeReserve(ctx, { commitmentId: reserve.id, transactionId: payment });

	const [spending] = statements.spending(ctx, { month: '2026-10' });
	expect(spending).toMatchObject({
		netMinor: C.C03.expected.spendingAfterPaymentMinor,
		movementCount: C.C03.expected.recordedPaymentCount
	});
	expect(budgets.getBudget(ctx, budget.id)).toMatchObject({
		spentMinor: C.C03.expected.spendingAfterPaymentMinor,
		remainingMinor: C.C03.expected.budgetRemainingMinor
	});
	expect(commitments.getCommitment(ctx, reserve.id).balanceMinor).toBe(
		C.C03.expected.reserveAfterConsumptionMinor
	);
	// One real payment, one movement, one reserve entry — no second spend.
	expect(statements.listMovements(ctx, { month: '2026-10' })).toHaveLength(
		C.C03.expected.recordedPaymentCount
	);
	expect(commitments.listCommitmentEntries(ctx, reserve.id)).toHaveLength(1);
});

test('C04 — a linked partial refund nets 80000 in the same month and never becomes income', () => {
	const ctx = fixtureUser('c04');
	const account = ledger(ctx, 'C04 account', 'KES', 1000000);
	const expense = line(ctx, account.id, '2026-10-05', -C.C04.expenseMinor, 'C04 expense');
	const refund = line(ctx, account.id, '2026-10-06', C.C04.refundMinor, 'C04 refund');
	statements.linkMovement(ctx, { id: refund, parentId: expense, relation: 'refund' });

	const [spending] = statements.spending(ctx, { month: '2026-10' });
	expect(spending).toMatchObject({
		grossMinor: C.C04.expected.grossExpensesMinor,
		refundMinor: C.C04.expected.refundsMinor,
		netMinor: C.C04.expected.netPersonalSpendingMinor,
		incomeMinor: C.C04.expected.personalIncomeMinor
	});
});

test('C05 — cash withdrawal: spending 0, cash named, no invented counterpart or cash balance', () => {
	const ctx = fixtureUser('c05');
	const account = ledger(ctx, 'C05 account', 'KES', 1000000);
	const withdrawal = line(
		ctx,
		account.id,
		'2026-10-03',
		-C.C05.bankOutflowMinor,
		'ATM cash withdrawal'
	);
	statements.classifyMovements(ctx, { ids: [withdrawal], kind: 'cash' });

	const [spending] = statements.spending(ctx, { month: '2026-10' });
	expect(spending).toMatchObject({
		netMinor: C.C05.expected.personalSpendingMinor,
		cashMinor: C.C05.expected.unresolvedCashMovementMinor,
		cashCount: 1,
		transferCount: 0,
		custodyCount: 0
	});
	// The cash is a gap, not a number: nothing was written to stand in for it.
	const movements = statements.listMovements(ctx);
	expect(movements).toHaveLength(1);
	expect(movements[0]).toMatchObject({ kind: 'cash', groupId: null, counterpartPending: false });
	expect(ledgers.listLedgers(ctx).filter((row) => row.kind === 'cash')).toHaveLength(0);
	// The bank balance still counts the withdrawal; it is the spending figure that does not.
	expect(ledgers.getLedger(ctx, account.id).supportedMinor).toBe(
		1000000 - C.C05.expected.unresolvedCashMovementMinor
	);
});

test('C06 — cross-currency transfer: no combined total, no invented FX, per-currency spending 0', () => {
	const ctx = fixtureUser('c06');
	const kes = ledger(ctx, 'C06 shillings', C.C06.source.currency, 500000);
	const usd = ledger(ctx, 'C06 dollars', C.C06.destination.currency, 10000);
	const outgoing = line(ctx, kes.id, '2026-10-04', C.C06.source.minor, 'Cross-currency transfer');
	const incoming = line(
		ctx,
		usd.id,
		'2026-10-04',
		C.C06.destination.minor,
		'Cross-currency transfer'
	);
	statements.linkTransfer(ctx, { id: outgoing, counterpartId: incoming });

	const spending = statements.spending(ctx, { month: '2026-10' });
	expect(spending.map((row) => [row.currency, row.netMinor])).toEqual(
		Object.entries(C.C06.expected.personalSpendingMinorByCurrency)
	);
	// Each currency is a total of its own; unlike money is never added.
	for (const row of spending) expect(row.transferCount).toBe(1);
	expect(() => statements.monthlyTotals(ctx)).toThrow(/one.*currency/i);
	expect(() => statements.categorySlices(ctx)).toThrow(/one.*currency/i);
	expect(C.C06.expected.combinedCrossCurrencyTotal).toBeNull();
	// No guessed rate or fee was written: exactly the two legs, amounts untouched.
	const movements = statements.listMovements(ctx);
	expect(movements).toHaveLength(2 + C.C06.expected.inventedFxOrFeeEntries);
	expect(movements.map((row) => row.amountCents).sort((a, b) => a - b)).toEqual(
		[C.C06.source.minor, C.C06.destination.minor].sort((a, b) => a - b)
	);
	expect(new Set(movements.map((row) => row.groupId)).size).toBe(1);
	expect(ledgers.supported(ctx).map((row) => [row.currency, row.supportedMinor])).toEqual([
		['KES', 240000],
		['USD', 12000]
	]);
});

test('C07 — custody settlement reduces funds and payable equally, so available is unchanged', () => {
	const ctx = fixtureUser('c07');
	const [firstOpening, secondOpening] = C.C07.supportedLiquidBalancesMinor;
	const first = ledger(ctx, 'C07 first account', 'KES', firstOpening);
	ledger(ctx, 'C07 second account', 'KES', secondOpening);
	// The stock is custody: architecture §4 subtracts custody and reserves from
	// supported funds, and never subtracts a payable. The fixture calls the
	// same 600000 "custody payable"; it must leave available money here.
	const payable = commitments.createCommitment(ctx, {
		name: 'C07 custody payable',
		kind: 'custody',
		currency: 'KES',
		openingMinor: C.C07.custodyPayableMinor
	});
	commitments.createCommitment(ctx, {
		name: 'C07 personal reserve',
		kind: 'reserve',
		currency: 'KES',
		openingMinor: C.C07.personalReservesMinor
	});

	const before = available(ctx, 'KES');
	expect(before.supported).toBe(C.C07.expected.supportedFundsBeforeMinor);
	expect(before.available).toBe(C.C07.expected.fundsAfterCommitmentsBeforeMinor);
	// The overview's own formula agrees: funds, then the two subtractions.
	const picture = () =>
		summary
			.moneyOverview(ctx, { month: '2026-10' })
			.currencies.find((row) => row.currency === 'KES')!;
	expect(picture()).toMatchObject({
		fundsMinor: C.C07.expected.supportedFundsBeforeMinor,
		custodyMinor: C.C07.custodyPayableMinor,
		availableMinor: C.C07.expected.fundsAfterCommitmentsBeforeMinor
	});

	const settlement = line(
		ctx,
		first.id,
		'2026-10-10',
		-C.C07.ownerApprovedOffsetMinor,
		'C07 custody settlement'
	);
	commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: settlement });

	const after = available(ctx, 'KES');
	expect(after.supported).toBe(C.C07.expected.supportedFundsAfterMinor);
	expect(after.custody).toBe(C.C07.expected.payableAfterMinor);
	expect(after.available).toBe(C.C07.expected.fundsAfterCommitmentsAfterMinor);
	expect(picture()).toMatchObject({
		fundsMinor: C.C07.expected.supportedFundsAfterMinor,
		custodyMinor: C.C07.expected.payableAfterMinor,
		availableMinor: C.C07.expected.fundsAfterCommitmentsAfterMinor,
		payablesMinor: 0
	});
	// The settlement moved funds and the payable by the same amount: one
	// deduction, not two. Available money is unchanged by settling.
	expect(before.supported - after.supported).toBe(C.C07.ownerApprovedOffsetMinor);
	expect(before.custody - after.custody).toBe(C.C07.ownerApprovedOffsetMinor);
	expect(after.available).toBe(before.available);
	expect(commitments.listCommitmentEntries(ctx, payable.id)).toHaveLength(1);
});

test('C08 — unknown opening and observed difference: named gap, no adjustment entries', () => {
	const ctx = fixtureUser('c08');
	// No opening date: the balance is recorded movements only, never certified.
	const account = ledgers.createLedger(ctx, { name: 'C08 USD account', currency: 'USD' });
	line(ctx, account.id, '2026-10-05', C.C08.recordedNetMinor, 'C08 recorded net');

	const stored = ledgers.getLedger(ctx, account.id);
	expect(stored.openingOn).toBeNull();
	expect(stored.recordedMinor).toBe(C.C08.recordedNetMinor);
	expect(stored.supportedMinor).toBeNull();
	expect(stored.balanceStatus).toBe('recorded');

	const check = ledgers.recordBalanceCheck(ctx, {
		ledgerId: account.id,
		asOf: '2026-10-10',
		observedMinor: C.C08.observedBalanceMinor,
		note: 'Synthetic observed balance'
	});
	// Without an opening the service neither certifies a balance nor a difference.
	expect(check).toMatchObject({
		observedMinor: C.C08.observedBalanceMinor,
		computedMinor: null,
		differenceMinor: null,
		status: 'unverified'
	});
	/*
	 * The fixture's -400 is its own subtraction (observed minus recorded) over
	 * an unknown opening. The app never certifies that figure: it names the
	 * gap, leaves computed/difference null, and writes no adjustment entry
	 * (Story 5.4.4, architecture D5/D9). The subtraction below is the
	 * fixture's arithmetic, exactly what the app refuses to claim as money.
	 */
	expect(check.observedMinor - stored.recordedMinor).toBe(
		C.C08.expected.unexplainedDifferenceMinor
	);
	expect(C.C08.openingKnown).toBe(false);
	expect(C.C08.expected.balanceStatus).toBe('unreconciled');
	expect(stored.supportedMinor).toBe(C.C08.expected.certifiedAvailableFunds);
	// An observation is evidence, never an adjustment: no movement, no opening,
	// no commitment entry was written.
	expect(statements.listMovements(ctx)).toHaveLength(1);
	expect(
		database.get('select count(*) as n from finance_transactions where user_id = ?', ctx.userId)
	).toEqual({ n: 1 + C.C08.expected.automaticAdjustmentEntries });
	expect(
		database.get(
			'select count(*) as n from finance_commitment_entries where user_id = ?',
			ctx.userId
		)
	).toEqual({ n: C.C08.expected.automaticAdjustmentEntries });
	expect(ledgers.getLedger(ctx, account.id).openingOn).toBeNull();
	const usd = ledgers.supported(ctx).find((row) => row.currency === 'USD')!;
	expect(usd.supportedMinor).toBeNull();
	expect(usd.included).toEqual([]);
	expect(usd.excluded.map((row) => row.id)).toEqual([account.id]);
});

test('C09 — import replay adds nothing and preserves kinds, splits, links and source fields', () => {
	const ctx = fixtureUser('c09');
	const account = ledger(ctx, 'C09 imported account', 'KES', 0);
	const payable = commitments.createCommitment(ctx, {
		name: 'C09 custody',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 10000
	});
	// The fixture's synthetic source ids are fixture-a/b/c. This bank export
	// carries a hex UUID per row, so each id is the UUID the importer stores
	// and the description keeps the fixture's name.
	const sourceId = (n: 1 | 2 | 3) => `f1c7a000-0000-4000-8000-00000000000${n}`;
	const text = [
		'Data,Valor,Identificador,Descrição',
		`02/10/2026,-10.00,${sourceId(1)},${C.C09.syntheticSourceIds[0]}`,
		`03/10/2026,-20.00,${sourceId(2)},${C.C09.syntheticSourceIds[1]}`,
		`04/10/2026,5.00,${sourceId(3)},${C.C09.syntheticSourceIds[2]}`
	].join('\n');
	const importFrom = () =>
		statements.importStatement(ctx, {
			ledgerId: account.id,
			source: 'nubank:conta_corrente',
			text
		});

	const first = importFrom();
	expect(first).toEqual({
		added: C.C09.expected.firstImportAdded,
		skipped: 0,
		recordedOnly: false
	});
	const idOf = (externalId: string) =>
		(
			database.get(
				'select id from finance_transactions where user_id = ? and external_id = ?',
				ctx.userId,
				externalId
			) as { id: number }
		).id;
	const [a, b, c] = [sourceId(1), sourceId(2), sourceId(3)].map(idOf);

	// Classify, split and link the imported rows the way a person would.
	statements.classifyMovements(ctx, { ids: [a], kind: 'expense' });
	statements.classifyMovements(ctx, { ids: [b], kind: 'expense' });
	statements.splitMovement(ctx, {
		id: b,
		allocations: [
			{ kind: 'personal', amountMinor: -1500 },
			{ kind: 'custody', amountMinor: -500, commitmentId: payable.id }
		]
	});
	statements.linkMovement(ctx, { id: c, parentId: a, relation: 'refund' });

	const snapshot = () => ({
		transactions: database.all(
			'select * from finance_transactions where user_id = ? order by id',
			ctx.userId
		),
		allocations: database.all(
			'select * from finance_transaction_allocations where user_id = ? order by id',
			ctx.userId
		),
		entries: database.all(
			'select * from finance_commitment_entries where user_id = ? order by id',
			ctx.userId
		)
	});
	const before = snapshot();

	const replay = importFrom();
	expect(replay).toEqual({
		added: C.C09.expected.secondImportAdded,
		skipped: C.C09.expected.secondImportSkipped,
		recordedOnly: false
	});
	// A replay is the same rows: kinds, splits, links, source fields intact.
	expect(snapshot()).toEqual(before);
	expect(statements.getMovementRow(ctx, a)).toMatchObject({
		kind: 'expense',
		source: 'nubank:conta_corrente',
		externalId: sourceId(1)
	});
	expect(
		statements
			.getMovementRow(ctx, b)!
			.allocations.map((row) => row.kind)
			.sort()
	).toEqual(['custody', 'personal']);
	expect(statements.getMovementRow(ctx, c)).toMatchObject({
		kind: 'refund',
		parentId: a,
		source: 'nubank:conta_corrente',
		externalId: sourceId(3)
	});
	expect(commitments.listCommitmentEntries(ctx, payable.id)).toHaveLength(1);
});

test('C10 — a refund follows its actual date across months and does not rewrite the expense month', () => {
	const ctx = fixtureUser('c10');
	const account = ledger(ctx, 'C10 account', 'KES', 1000000);
	const expense = line(ctx, account.id, C.C10.expense.date, -C.C10.expense.minor, 'C10 expense');
	const refund = line(ctx, account.id, C.C10.refund.date, C.C10.refund.minor, 'C10 refund');
	statements.linkMovement(ctx, { id: refund, parentId: expense, relation: 'refund' });

	const february = statements.spending(ctx, { month: '2026-02' })[0];
	const march = statements.spending(ctx, { month: '2026-03' })[0];
	expect(february.netMinor).toBe(C.C10.expected.februaryNetSpendingMinor);
	expect(march).toMatchObject({
		grossMinor: C.C10.expected.marchGrossExpensesMinor,
		refundMinor: C.C10.expected.marchRefundsMinor,
		netMinor: C.C10.expected.marchNetSpendingMinor
	});
	// February keeps every minor unit it had.
	expect(
		statements.listMovements(ctx, { month: '2026-02' })[0].amountCents + C.C10.expense.minor
	).toBe(C.C10.expected.silentlyRewrittenFebruaryAmounts);
});

test('C11 — a repeated settlement request loses to a conflict; one movement, one entry', () => {
	const ctx = fixtureUser('c11');
	const account = ledger(ctx, 'C11 account', 'KES', 1000000);
	const payable = commitments.createCommitment(ctx, {
		name: 'C11 payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: C.C11.outstandingMinor
	});
	const [firstMinor] = C.C11.concurrentSettlementRequestsMinor;
	const payment = line(ctx, account.id, '2026-10-08', -firstMinor, 'C11 settlement');

	commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: payment });
	/*
	 * This is a sequential replay of one settlement request, not true
	 * concurrency: the fixture claims no idempotency key in this release, so
	 * the second arrival is refused as a conflict rather than applied twice.
	 * The second half below is the competing-payment case: a distinct movement
	 * against an exhausted payable is refused by the outstanding balance and
	 * writes no allocation or entry.
	 */
	let secondResult = 'accepted';
	try {
		commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: payment });
	} catch (error) {
		secondResult = (error as { code?: string }).code ?? 'error';
	}
	expect(secondResult).toBe(C.C11.expected.secondResult);
	expect(commitments.getCommitment(ctx, payable.id).balanceMinor).toBe(
		C.C11.expected.outstandingMinor
	);
	expect(commitments.listCommitmentEntries(ctx, payable.id)).toHaveLength(
		C.C11.expected.successfulSettlements
	);
	// The refused request left no duplicate bank movement behind.
	expect(statements.listMovements(ctx)).toHaveLength(1 + C.C11.expected.duplicateBankMovements);
	expect(secondResult).toBe('conflict');

	// A genuinely competing second payment is refused by the outstanding
	// balance, and again writes no allocation or entry.
	const competing = line(
		ctx,
		account.id,
		'2026-10-09',
		-C.C11.outstandingMinor,
		'C11 second offer'
	);
	expect(() =>
		commitments.settleCommitment(ctx, { commitmentId: payable.id, transactionId: competing })
	).toThrow(/outstanding balance is 0/i);
	expect(statements.getMovementRow(ctx, competing)!.allocations).toEqual([]);
	expect(commitments.listCommitmentEntries(ctx, payable.id)).toHaveLength(
		C.C11.expected.successfulSettlements
	);
});

test('C12 — a cross-owner reference is refused exactly like a missing one, changing no rows', () => {
	const requestOwner = fixtureUser('c12-a');
	const referencedRowOwner = fixtureUser('c12-b');
	const mine = ledger(requestOwner, 'C12 mine', 'KES', 1000000);
	const theirs = ledger(referencedRowOwner, 'C12 theirs', 'KES', 1000000);
	const myMovement = line(requestOwner, mine.id, '2026-10-05', -1000, 'C12 my movement');
	const theirMovement = line(
		referencedRowOwner,
		theirs.id,
		'2026-10-05',
		-1000,
		'C12 their movement'
	);
	const theirCommitment = commitments.createCommitment(referencedRowOwner, {
		name: 'C12 their payable',
		kind: 'payable',
		currency: 'KES',
		openingMinor: 1000
	});

	const tables = () => ({
		ledgers: database.all('select * from ledgers order by id'),
		transactions: database.all('select * from finance_transactions order by id'),
		allocations: database.all('select * from finance_transaction_allocations order by id'),
		commitments: database.all('select * from finance_commitments order by id'),
		entries: database.all('select * from finance_commitment_entries order by id')
	});
	const before = tables();

	const foreign = {
		getCommitment: refusal(() => commitments.getCommitment(requestOwner, theirCommitment.id)),
		settle: refusal(() =>
			commitments.settleCommitment(requestOwner, {
				commitmentId: theirCommitment.id,
				transactionId: myMovement
			})
		),
		split: refusal(() =>
			statements.splitMovement(requestOwner, {
				id: myMovement,
				allocations: [{ kind: 'custody', amountMinor: -1000, commitmentId: theirCommitment.id }]
			})
		)
	};
	const missing = {
		getCommitment: refusal(() => commitments.getCommitment(requestOwner, 999_999)),
		settle: refusal(() =>
			commitments.settleCommitment(requestOwner, {
				commitmentId: 999_999,
				transactionId: myMovement
			})
		),
		split: refusal(() =>
			statements.splitMovement(requestOwner, {
				id: myMovement,
				allocations: [{ kind: 'custody', amountMinor: -1000, commitmentId: 999_999 }]
			})
		)
	};
	// Same status and message as a missing id: the refusal does not leak that
	// the row exists under another owner.
	expect(C.C12.expected.result).toBe('same_as_missing');
	expect(foreign).toEqual(missing);
	// A foreign movement resolves to null, exactly as a missing one does.
	expect(statements.getMovementRow(requestOwner, theirMovement)).toBeNull();
	expect(statements.getMovementRow(requestOwner, 999_999)).toBeNull();
	// Nothing leaked from the failed attempts, and no row changed.
	for (const message of Object.values(foreign)) {
		expect(message).not.toContain(String(theirCommitment.id));
		expect(message).not.toContain(String(theirMovement));
		expect(message).not.toContain(referencedRowOwner.userId);
	}
	expect(tables()).toEqual(before);
});
