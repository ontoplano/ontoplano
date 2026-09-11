import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { getCurrency } from '$lib/services/settings';
import { recordsSeries, statementSeries } from '$lib/services/statements';

/**
 * The month's two honest answers, side by side and never merged: what your
 * own records say (income received against bills paid) and what your bank
 * statements say. A salary that appears in both would be double-counted by
 * any series that combined them, so none does.
 */
export const load = async ({ locals }: SelfContainedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		currency: getCurrency(ctx.userId),
		records: recordsSeries(ctx),
		statements: statementSeries(ctx)
	};
};
