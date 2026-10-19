import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { commitmentTotals, listCommitments } from '$lib/services/commitments';

/**
 * What the account owes, holds and has set aside, for a script.
 *
 * Stocks, not bank movements or budgets: custody, payables, receivables and
 * reserves stay separate by kind and original currency, and the totals are the
 * same ones the Commitments screen shows. Payables and receivables are never
 * folded into available money.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'statements:read');
		const includeArchived = event.url.searchParams.get('include_archived') === 'true';
		return Response.json({
			commitments: listCommitments(ctx, { includeArchived }),
			totals: commitmentTotals(ctx)
		});
	} catch (e) {
		return toJsonError(e);
	}
};
