import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { getLedger } from '$lib/services/ledgers';
import { listMovementPage } from '$lib/services/statements';
import { NotFoundError } from '$lib/services/errors';

/**
 * A page of statement lines, newest first, for a script.
 *
 * Bounded on purpose: `limit` defaults to 100 and cannot exceed it, and
 * `cursor` is the id the previous page answered with. No call returns the
 * whole history — a plugin polling a statement should not be able to pull a
 * decade of lines, nor pay for sorting them.
 *
 * `ledger` narrows to one owned account. An id belonging to another account is
 * answered exactly like one that does not exist, so the refusal says nothing
 * about whose id it was.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'statements:read');
		const q = event.url.searchParams;
		const ledger = q.get('ledger');
		const cursor = q.get('cursor');
		if (cursor !== null && !/^\d+$/.test(cursor)) throw new NotFoundError('movement');

		return Response.json(
			listMovementPage(ctx, {
				limit: q.get('limit') === null ? undefined : Number(q.get('limit')),
				beforeId: cursor === null ? undefined : Number(cursor),
				ledgerId: ledger === null ? undefined : getLedger(ctx, Number(ledger)).id,
				month: q.get('month') ?? undefined
			})
		);
	} catch (e) {
		return toJsonError(e);
	}
};
