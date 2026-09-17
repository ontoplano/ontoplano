import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadConfig } from '$lib/server/config';
import { tokenMatches } from '$lib/server/services/health';
import { deliverDueReminders } from '$lib/server/services/reminder-delivery';
import { notifyAssistantBursts } from '$lib/server/services/assistant-notify';
import { markJobRan } from '$lib/server/services/companions';

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

	// The instance page reads this stamp: "last asked a minute ago" is the
	// honest answer to "are reminders running", whoever is doing the asking.
	markJobRan('reminders');

	/*
	 * The moment to work from, if the caller names one and the instance allows
	 * it.
	 *
	 * Ordinarily the pass uses the clock, and the box calls it every minute.
	 * `?at=` replays a window that was missed — a box down for an hour has an
	 * hour of reminders sitting unstamped, and "run it as though it were then"
	 * is what an operator wants at that point.
	 *
	 * Behind `[instance] job_replay` because it *is* a widening, even though
	 * the token is the same: somebody holding it could otherwise make
	 * tomorrow's reminders arrive today. Bounded — the query that finds
	 * candidates uses the real clock and looks no more than a day ahead — but
	 * a production instance has no use for it, so production does not have it.
	 *
	 * Refused rather than ignored: silently using the wrong clock is how an
	 * operator concludes the replay worked and the reminders were lost.
	 */
	const asked = url.searchParams.get('at');
	if (asked && !loadConfig().instance.jobReplay)
		return json({ ok: false, why: 'job_replay is off on this instance' }, { status: 403 });

	const at = asked ? new Date(asked) : null;
	if (asked && (!at || Number.isNaN(at.getTime())))
		return json({ ok: false, why: 'at is not a date' }, { status: 400 });

	const result = at ? await deliverDueReminders(at) : await deliverDueReminders();

	/*
	 * And what the assistants did, in the same minute.
	 *
	 * Its own concern, not its own timer: the quiet window a burst has to
	 * clear is a minute, which is exactly this cadence, and a second unit on
	 * the box would be a second thing to provision, watch and forget. It
	 * cannot fail the reminders — the reminders have already been sent by the
	 * line above, and this answers with what it did rather than throwing.
	 */
	const assistants = await notifyAssistantBursts().catch((error) => ({
		waiting: 0,
		pushed: 0,
		busy: 0,
		muted: 0,
		failed: String(error)
	}));

	return json({ ok: true, ...result, assistants });
};
