import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { listLedgers } from '$lib/services/ledgers';
import { normaliseCurrency } from '$lib/money';
import { NotFoundError, ValidationError } from '$lib/services/errors';
import { num } from '$lib/services/validate';
import { listBudgets } from '$lib/services/budgets';
import { getCurrency } from '$lib/services/settings';
import { monthParam } from '$lib/when';
import {
	categoryMonths,
	categorySlices,
	filterOptions,
	monthlyTotals,
	tagMonths,
	statementWindow,
	spending
} from '$lib/services/statements';

/**
 * The questions a year of statements can answer.
 *
 * Three, deliberately: what went in and out each month, where the spending
 * went by category, and what one tag costs — the last on its own because
 * tags overlap, and adding two of them would count a line twice.
 */
export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const ledgerId = url.searchParams.get('ledger')
		? num(url.searchParams.get('ledger'), 'ledger', { int: true, min: 1 })
		: undefined;
	const months = url.searchParams.has('months')
		? num(url.searchParams.get('months'), 'months', { int: true, min: 1, max: 120 })
		: 12;
	const month = monthParam(url.searchParams.get('month')) ?? '';
	const window = statementWindow(ctx, months, {
		month: month || undefined,
		from: url.searchParams.get('from') || undefined,
		to: url.searchParams.get('to') || undefined
	});
	const ledgers = listLedgers(ctx, { includeArchived: true, asOf: window.to });
	const ledger = ledgerId ? ledgers.find((row) => row.id === ledgerId) : undefined;
	if (ledgerId && !ledger) throw new NotFoundError('ledger');
	const currencies = [...new Set(ledgers.map((row) => row.currency))];
	const requested = url.searchParams.get('currency');
	if (requested && requested !== 'unspecified' && !normaliseCurrency(requested))
		throw new ValidationError('Choose a valid original currency.');
	const currency = ledger
		? ledger.currency
		: requested === 'unspecified'
			? null
			: requested
				? normaliseCurrency(requested)
				: (currencies.find((code) => code !== null) ?? null);
	if (!currencies.includes(currency)) currencies.push(currency);
	const options = filterOptions(ctx);
	const tag = url.searchParams.get('tag') || options.tags[0]?.name || '';
	const filter = { ledgerId, currency, from: window.from, to: window.to };
	const coverage = ledgers.filter(
		(row) => row.currency === currency && (!ledgerId || row.id === ledgerId)
	);
	const selectedMonth =
		window.months.length === 1 &&
		window.from === `${window.months[0]}-01` &&
		window.to === statementWindow(ctx, 1, { month: window.months[0] }).to
			? window.months[0]
			: '';

	return {
		currency,
		// Legacy ledgers may declare no currency at all. The page still has to be
		// readable: amounts fall back to the account's own currency for display,
		// while the data stays the unspecified bucket (D6).
		defaultCurrency: getCurrency(ctx.userId),
		currencies,
		ledgers,
		ledgerId: ledgerId ?? 0,
		months,
		month: selectedMonth,
		budgets: selectedMonth && currency ? listBudgets(ctx, { month: selectedMonth, currency }) : [],
		window,
		defaultWindow:
			!month && !url.searchParams.has('from') && !url.searchParams.has('to') && months === 12,
		report: spending(ctx, filter)[0] ?? null,
		balanceCoverage: {
			total: coverage.length,
			verified: coverage.filter((row) => row.balanceStatus === 'verified').length
		},
		tags: options.tags,
		tag,
		totals: monthlyTotals(ctx, months, filter),
		byCategory: categoryMonths(ctx, months, filter),
		slices: categorySlices(ctx, filter),
		tagSeries: tag ? tagMonths(ctx, tag, months, filter) : null
	};
};
