import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { listBudgets } from '$lib/services/budgets';

/**
 * Monthly ceilings with what is spent and left against them, for a script.
 *
 * One month, original currencies, never an exchange-rate total. The same
 * numbers the Budgets screen shows: refund credits stay separate from income
 * and an orphaned category stays visible.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'statements:read');
		const q = event.url.searchParams;
		return Response.json({
			budgets: listBudgets(ctx, {
				month: q.get('month') ?? undefined,
				currency: q.get('currency') ?? undefined
			})
		});
	} catch (e) {
		return toJsonError(e);
	}
};
