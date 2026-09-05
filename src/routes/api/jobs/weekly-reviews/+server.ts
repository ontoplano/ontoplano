import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tokenMatches } from '$lib/server/services/health';
import { sendWeeklyReviews } from '$lib/server/services/review-mail';
import { markJobRan } from '$lib/server/services/companions';

/**
 * The hour's weekly review mail, done by the process that is already running.
 *
 * The same shape as `/api/jobs/reminders`, for the same reason: the app has
 * the code loaded and the database open, so a timer — or the Docker image's
 * own scheduler, which has no systemd to lean on — asks it instead of booting
 * a second copy of everything. Hourly, because seven in the morning is a
 * different instant for every timezone; `sendWeeklyReviews` already does
 * nothing for the twenty-three runs that are not somebody's seven.
 *
 * Behind the health token, like the reminders job: it sends mail, so it is
 * not for the public. Absent token, absent endpoint.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const want = process.env.ONTOPLANO_HEALTH_TOKEN ?? '';
	const given = request.headers.get('x-health-token') ?? url.searchParams.get('token');

	// No token set means no way in, rather than a way in for everybody.
	if (!want || !tokenMatches(want, given)) return json({ ok: false }, { status: 404 });

	// The instance page reads this stamp, so "asked an hour ago" is answerable
	// whatever is doing the asking — systemd, the container, or a curl.
	markJobRan('weekly-reviews');

	const result = await sendWeeklyReviews();
	return json({ ok: true, ...result });
};
