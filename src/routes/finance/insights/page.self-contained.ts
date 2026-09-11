import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { getCurrency } from '$lib/services/settings';
import { listLedgers } from '$lib/services/ledgers';
import {
	categoryMonths,
	categorySlices,
	filterOptions,
	monthlyTotals,
	tagMonths
} from '$lib/services/statements';

/**
 * The questions a year of statements can answer.
 *
 * Three, deliberately: what went in and out each month, where the spending
 * went by category, and what one tag costs — the last on its own because
 * tags overlap, and adding two of them would count a line twice.
 */
export const load = async ({ locals, url }: SelfContainedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const ledgerId = Number(url.searchParams.get('ledger') || 0) || undefined;
	const months = Number(url.searchParams.get('months') || 0) || 12;
	const options = filterOptions(ctx);
	const tag = url.searchParams.get('tag') || options.tags[0]?.name || '';
	const filter = { ledgerId };

	return {
		currency: getCurrency(ctx.userId),
		ledgers: listLedgers(ctx),
		ledgerId: ledgerId ?? 0,
		months,
		tags: options.tags,
		tag,
		totals: monthlyTotals(ctx, months, filter),
		byCategory: categoryMonths(ctx, months, filter),
		slices: categorySlices(ctx, filter),
		tagSeries: tag ? tagMonths(ctx, tag, months, filter) : null
	};
};
