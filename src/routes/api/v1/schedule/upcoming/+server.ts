import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { getUpcomingSchedule } from '$lib/server/services/schedule';

/**
 * Upcoming scheduled occurrences, so an external app can act on the plan.
 *
 * This is what an alarm app reads to set alarms from planner slots. Ontoplano
 * reports *what is scheduled*; deciding which occurrences deserve an alarm —
 * and what kind — is the consumer's business, matched on `title`, `category`
 * or `label`.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'schedule:read');
		const q = event.url.searchParams;
		const result = getUpcomingSchedule(ctx, {
			days: q.get('days') ?? undefined,
			includeCompleted: q.get('include_completed') === 'true'
		});
		return Response.json(result);
	} catch (e) {
		return toJsonError(e);
	}
};
