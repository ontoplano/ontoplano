/**
 * Where a reminder leads, as a route and a query, and nothing else.
 *
 * A nudge before a block leads to the day it is on; a birthday leads to the
 * person whose it is; the weekly nag leads to the week it is nagging about.
 * Every kind leads somewhere, which is the rule that killed the kind that hung
 * off nothing: a notification you cannot follow is one you have to remember
 * twice — once because it told you, and again because seeing the thing it is
 * about means going and finding it.
 *
 * This is the whole answer, in one place, because there are two callers and
 * they cannot share code that resolves paths: the browser's goes through
 * SvelteKit's router, and the delivery job runs in a cron script where that
 * router does not exist. They used to hold a copy each, and the copies said
 * different things — the weekly review's notification landed on the board,
 * which is not the review.
 */
export type ReminderRef = {
	remindAt: string;
	subjectKind?: string | null;
	subjectId?: number | null;
};

/**
 * The routes a reminder can lead to, spelled the way SvelteKit's router spells
 * them — a union rather than a string, so `resolve` takes it without a cast
 * and a route renamed out from under this stops the build.
 */
export type ReminderRoute =
	| '/notebooks/people'
	| '/tasks/review'
	| '/finance/bills'
	| '/tasks/todo'
	| '/tasks/board';

/** A route as SvelteKit spells it, and what to hang off it. */
export type ReminderLink = { route: ReminderRoute; query: string };

/** The day before `day`, as a civil date. Never converted to an instant. */
function dayBefore(day: string): string {
	const d = new Date(day + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export function reminderLink(reminder: ReminderRef): ReminderLink {
	const day = reminder.remindAt.slice(0, 10);

	switch (reminder.subjectKind) {
		case 'person':
			return reminder.subjectId
				? { route: '/notebooks/people', query: `?person=${reminder.subjectId}` }
				: { route: '/notebooks/people', query: '' };

		/*
		 * The week that just ended, not the one now running.
		 *
		 * This nag is written on the morning the week turns over, so the week it
		 * is about is the one the day before belongs to. The review page snaps
		 * whatever date it is given to that week's first day, so handing it
		 * yesterday is enough — and its arrows reach anything older, which
		 * matters because the nag can be about a fortnight ago.
		 */
		case 'review':
			return { route: '/tasks/review', query: `?week=${dayBefore(day)}` };

		case 'bill':
			return { route: '/finance/bills', query: '' };

		case 'todo':
			return { route: '/tasks/todo', query: '' };

		/*
		 * A block, the end of a day, and an alarm about nothing in particular
		 * all belong to a day, and the day's own page is where they lead.
		 * So does a kind nobody has taught this about yet: the day it was for
		 * is the best guess available and a better one than going nowhere.
		 */
		default:
			return { route: '/tasks/board', query: `?date=${day}` };
	}
}
