import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { moneyOverview } from '$lib/services/finance-summary';
import { getCurrency } from '$lib/services/settings';
import { monthParam } from '$lib/when';

/**
 * The money picture.
 *
 * One month at a time, every original currency separately. The month is the
 * one asked for; with none, the account's own current month, not the box's.
 */
export const load = ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		overview: moneyOverview(ctx, { month: monthParam(url.searchParams.get('month')) }),
		// Legacy ledgers without a declared currency are still readable: amounts
		// are formatted in the account's own currency, labelled as not a total.
		defaultCurrency: getCurrency(ctx.userId)
	};
};
