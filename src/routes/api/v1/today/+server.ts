import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/server/services/errors';
import { getTodayBoard } from '$lib/server/services/today';

/**
 * Today's blocks, habits and tasks, for the home-screen widget.
 *
 * Separate from `/schedule/upcoming`, which answers "what is coming" for an
 * alarm consumer. This answers "what does today look like", which is a
 * different question and a different scope: a widget on a lock screen should
 * not carry a token that can also read a week ahead.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'today:read');
		return Response.json(getTodayBoard(ctx));
	} catch (e) {
		return toJsonError(e);
	}
};
