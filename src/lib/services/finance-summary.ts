/**
 * The four questions, answered once.
 *
 * What is mine, what is committed, what I spent this month, and what is left
 * against my plans — for every original currency separately, because §4 says
 * currencies never add (D6) and because a total that mixes them is a total
 * nobody can act on.
 *
 * This module does no arithmetic of its own beyond the cross-room formulas in
 * `architecture.md` §4: supported funds come from `ledgers.ts` (D5), spending
 * from `statements.ts` (D4), budgets from `budgets.ts` (D7), stocks from
 * `commitments.ts` (D7). It only puts them beside each other and names the
 * gaps. Every figure is one aggregate query — the inputs are grouped reads;
 * nothing here loads statement rows and re-sums them in JavaScript (D11).
 */
import { localDateOf, type Ctx } from './ctx.js';
import { budgetMonth, listBudgets, type Budget } from './budgets.js';
import { commitmentTotals, type CommitmentKind } from './commitments.js';
import { listLedgers, type Ledger } from './ledgers.js';
import { spending, type Spending } from './statements.js';
import { civilDay, minorAmount } from './validate.js';

/** A thing the screen must name instead of hiding in a confident total. */
export type MoneyGap =
	| { kind: 'no-opening'; count: number; ledgers: { id: number; name: string }[] }
	| { kind: 'outside-coverage'; count: number; ledgers: { id: number; name: string }[] }
	| {
			kind: 'balance-differs';
			count: number;
			ledgers: { id: number; name: string; differenceMinor: number }[];
	  }
	| { kind: 'unclassified'; count: number }
	| { kind: 'unmatched-refunds'; count: number }
	| { kind: 'cash-unknown'; count: number; amountMinor: number };

/** How much of one currency's money rests on a declared opening. */
export type CurrencyCoverage = {
	/** Non-archived accounts in this currency, supported or not. */
	accounts: number;
	/** Accounts whose balance formula has a declared opening to start from. */
	supported: number;
	/** Accounts whose latest statement check matched the records. */
	verified: number;
	/** Accounts that hold only a recorded movement subtotal. */
	recorded: number;
};

export type CurrencyPicture = {
	/** The original currency, or null for accounts that never declared one. */
	currency: string | null;
	coverage: CurrencyCoverage;
	/**
	 * Σ supported(l) over supported accounts — null when no account in this
	 * currency has a declared opening (or the currency is unspecified), so the
	 * screen has no balance to label.
	 */
	fundsMinor: number | null;
	/** Movements of accounts with no declared opening; never called a balance. */
	recordedOnlyMinor: number;
	custodyMinor: number;
	reservesMinor: number;
	payablesMinor: number;
	receivablesMinor: number;
	/** supported funds − custody − reserves; null where fundsMinor is null. */
	availableMinor: number | null;
	/** What the chosen month spent personally, and what it deliberately left out. */
	spending: Spending;
	budgets: Budget[];
	gaps: MoneyGap[];
};

export type MoneyOverview = {
	/** The civil month every spending and budget figure belongs to. */
	month: string;
	/** The inclusive day the supported funds are computed at. */
	asOf: string;
	currencies: CurrencyPicture[];
};

const ZERO_SPENDING = (currency: string | null): Spending => ({
	currency,
	grossMinor: 0,
	refundMinor: 0,
	netMinor: 0,
	incomeMinor: 0,
	movementCount: 0,
	unclassifiedCount: 0,
	transferCount: 0,
	transferInMinor: 0,
	transferOutMinor: 0,
	cashCount: 0,
	cashMinor: 0,
	custodyCount: 0,
	custodyMinor: 0,
	unmatchedRefundCount: 0,
	byCategory: []
});

function sum(rows: number[]): number {
	return rows.reduce((total, amount) => minorAmount(total + amount, 'currency total'), 0);
}

function groups(ledgers: Ledger[]): Map<string | null, Ledger[]> {
	const held = new Map<string | null, Ledger[]>();
	for (const ledger of ledgers) {
		const at = held.get(ledger.currency);
		if (at) at.push(ledger);
		else held.set(ledger.currency, [ledger]);
	}
	return held;
}

function gapsOf(ledgers: Ledger[], spent: Spending): MoneyGap[] {
	const gaps: MoneyGap[] = [];
	const unnamed = ledgers
		.filter((ledger) => ledger.supportedMinor === null)
		.map(({ id, name }) => ({ id, name }));
	if (unnamed.length) gaps.push({ kind: 'no-opening', count: unnamed.length, ledgers: unnamed });

	const outside = ledgers
		.filter((ledger) => ledger.outsideCoveredPeriod > 0)
		.map(({ id, name }) => ({ id, name }));
	if (outside.length)
		gaps.push({ kind: 'outside-coverage', count: outside.length, ledgers: outside });

	const differs = ledgers
		.filter((ledger) => ledger.latestCheck?.status === 'different')
		.map(({ id, name, latestCheck }) => ({
			id,
			name,
			differenceMinor: latestCheck?.differenceMinor ?? 0
		}));
	if (differs.length)
		gaps.push({ kind: 'balance-differs', count: differs.length, ledgers: differs });

	if (spent.unclassifiedCount) gaps.push({ kind: 'unclassified', count: spent.unclassifiedCount });
	if (spent.unmatchedRefundCount)
		gaps.push({ kind: 'unmatched-refunds', count: spent.unmatchedRefundCount });
	if (spent.cashCount)
		gaps.push({ kind: 'cash-unknown', count: spent.cashCount, amountMinor: spent.cashMinor });

	return gaps;
}

/** Σ balances of one stock kind in one currency, from the one grouped read. */
function stockMinor(
	stocks: ReturnType<typeof commitmentTotals>,
	kind: CommitmentKind,
	currency: string | null
): number {
	let total = 0;
	for (const row of stocks)
		if (row.kind === kind && row.currency === currency)
			total = minorAmount(total + row.balanceMinor);
	return total;
}

/**
 * The money picture for one account at one civil month.
 *
 * Currencies are the union of the accounts, the open stocks, the month's
 * budgets and the month's spending — a currency is on the screen if it has
 * something to say, and an account in it is the only thing that can make a
 * supported total.
 */
export function moneyOverview(
	ctx: Ctx,
	filter: { month?: unknown; asOf?: unknown } = {}
): MoneyOverview {
	const asOf =
		filter.asOf === undefined ? localDateOf(ctx.now, ctx.tz) : civilDay(filter.asOf, 'as of');
	const month = budgetMonth(filter.month === undefined ? asOf.slice(0, 7) : filter.month);

	const ledgers = listLedgers(ctx, { asOf });
	const stocks = commitmentTotals(ctx);
	const spent = spending(ctx, { month });
	const budgets = listBudgets(ctx, { month }, spent);

	const held = groups(ledgers);
	const seen = new Set<string | null>(held.keys());
	for (const row of stocks) seen.add(row.currency);
	for (const row of budgets) seen.add(row.currency);
	for (const row of spent) seen.add(row.currency);

	const currencies = [...seen]
		.sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
		.map((currency): CurrencyPicture => {
			const accounts = held.get(currency) ?? [];
			const supported = accounts.filter((ledger) => ledger.supportedMinor !== null);
			const fundsMinor =
				currency === null || supported.length === 0
					? null
					: sum(supported.map((ledger) => minorAmount(ledger.supportedMinor, 'supported funds')));
			const custodyMinor = stockMinor(stocks, 'custody', currency);
			const reservesMinor = stockMinor(stocks, 'reserve', currency);
			const monthSpending =
				spent.find((row) => row.currency === currency) ?? ZERO_SPENDING(currency);
			const gaps = gapsOf(accounts, monthSpending);
			return {
				currency,
				coverage: {
					accounts: accounts.length,
					supported: supported.length,
					verified: accounts.filter((ledger) => ledger.balanceStatus === 'verified').length,
					recorded: accounts.filter((ledger) => ledger.balanceStatus === 'recorded').length
				},
				fundsMinor,
				recordedOnlyMinor: sum(
					accounts
						// Unspecified currency never gets a total, but its movements
						// still happened; a currency with supported accounts counts
						// only the ones that have no declared opening.
						.filter((ledger) => currency === null || ledger.supportedMinor === null)
						.map((ledger) => minorAmount(ledger.recordedMinor, 'recorded subtotal'))
				),
				custodyMinor,
				reservesMinor,
				payablesMinor: stockMinor(stocks, 'payable', currency),
				receivablesMinor: stockMinor(stocks, 'receivable', currency),
				availableMinor:
					fundsMinor === null
						? null
						: minorAmount(fundsMinor - custodyMinor - reservesMinor, 'available'),
				spending: monthSpending,
				budgets: budgets.filter((budget) => budget.currency === currency),
				gaps
			};
		});

	return { month, asOf, currencies };
}
