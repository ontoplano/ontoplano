import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tokenMatches } from '$lib/server/services/health';
import { deliverDueReminders } from '$lib/server/services/reminder-delivery';

/**
 * The minute's reminders, done by the process that is already running.
 *
 * The timer used to be `npx tsx scripts/deliver-reminders.ts`, which is a fresh
 * Node, a fresh TypeScript compile of the whole service graph and a fresh
 * database handle — about three seconds of CPU and a hundred megabytes, every
 * minute, for a job whose usual answer is "nothing is due". That is four per
 * cent of a core burned permanently on a small box, and it was noticed exactly
 * as it should have been: by somebody reading the journal and asking whether
 * that could possibly be right.
 *
 * The app has the code loaded and the database open. Asking it costs a request.
 *
 * Behind the health token, which the box already has for `/healthz`: this
 * writes and sends, so it is not for the public. Absent token, absent
 * endpoint — never open, whatever is misconfigured.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const want = process.env.ONTOPLANO_HEALTH_TOKEN ?? '';
	const given = request.headers.get('x-health-token') ?? url.searchParams.get('token');

	// No token set means no way in, rather than a way in for everybody.
	if (!want || !tokenMatches(want, given)) return json({ ok: false }, { status: 404 });

	const result = await deliverDueReminders();
	return json({ ok: true, ...result });
};
