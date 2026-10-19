import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { moneyOverview } from '$lib/services/finance-summary';

/**
 * The four money questions, for a script.
 *
 * The page's own figures through the page's own function: supported funds,
 * committed stocks, this month's personal spending and its exclusions, and the
 * month's budgets, each original currency separately. Gaps are named rather
 * than hidden in a total. Read-only, like the rest of this family.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'statements:read');
		const q = event.url.searchParams;
		return Response.json(
			moneyOverview(ctx, {
				month: q.get('month') ?? undefined,
				asOf: q.get('as_of') ?? undefined
			})
		);
	} catch (e) {
		return toJsonError(e);
	}
};
