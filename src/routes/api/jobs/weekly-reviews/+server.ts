import { jobEndpoint } from '$lib/server/jobs';
import { sendWeeklyReviews } from '$lib/server/services/review-mail';

/**
 * The hour's weekly review mail, done by the process that is already running.
 *
 * The same shape as `/api/jobs/reminders`, for the same reason — see
 * `$lib/server/jobs`. Hourly, because seven in the morning is a different
 * instant for every timezone; `sendWeeklyReviews` already does nothing for
 * the twenty-three runs that are not somebody's seven.
 */
export const POST = jobEndpoint('weekly-reviews', () => sendWeeklyReviews());
