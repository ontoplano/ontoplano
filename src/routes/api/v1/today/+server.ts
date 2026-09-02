import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { getTodayBoard } from '$lib/server/services/today';

/**
 * Today's plan, for the home-screen widget.
 *
 * Separate from `/schedule/upcoming`, which answers "what is coming" for an
 * alarm consumer. This answers "what does today look like", which is a
 * different question and a different scope: a widget on a lock screen should
 * not carry a token that can also read a week ahead.
 *
 * Habits come with it only for a token that was also granted `habits:read`.
 * The two used to be one permission, so the widget's token could report which
 * habits were kept — which nobody agreed to by ticking a line about the day's
 * plan.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx, holds } = authenticateApi(event, 'today:read');
		return Response.json(getTodayBoard(ctx, { habits: holds('habits:read') }));
	} catch (e) {
		return toJsonError(e);
	}
};
