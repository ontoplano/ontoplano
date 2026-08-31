import type { PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { listInstances } from '$lib/server/services/instances';
import { addDays, getISOWeekNumber, getISOWeekYear, getMonday } from '$lib/server/week-generator';
import { localOfInstant } from '$lib/server/services/time';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Last week by default: this week is what the tracker is for. */
function parseWeekParam(param: string | null, now: Date): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(param + 'T00:00:00');
		if (!isNaN(parsed.getTime())) return getMonday(parsed);
	}
	return addDays(getMonday(now), -7);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const monday = parseWeekParam(url.searchParams.get('week'), ctx.now);
	const nextMonday = addDays(monday, 7);

	/*
	 * Today, in the account's own zone.
	 *
	 * History is a record of what happened, so the page must not offer to walk
	 * into a week that has not. Which day "today" is depends on where the person
	 * is, not where the server is — an evening in Sao Paulo is already tomorrow
	 * in Berlin, and the strip would grey out a day they are still living.
	 */
	const today = localOfInstant(ctx.now, ctx.tz).slice(0, 10);

	const weekMeta = {
		monday: formatDate(monday),
		sunday: formatDate(addDays(monday, 6)),
		weekNumber: getISOWeekNumber(monday),
		weekYear: getISOWeekYear(monday),
		prevWeek: formatDate(addDays(monday, -7)),
		nextWeek: formatDate(nextMonday),
		/** Whether there is a next week to walk into at all. */
		hasNextWeek: formatDate(nextMonday) <= today
	};

	// The date of each column, so the strip can say "Sep 2 — Wed" rather than
	// leaving somebody to count along from the week's first date.
	const days = WEEKDAYS.map((name, i) => {
		const date = formatDate(addDays(monday, i));
		return { name, date, future: date > today };
	});

	// Read through the instances service, which is also what generated these
	// rows. The hand-written query this replaced joined weekly slots only, so a
	// week's one-off blocks were missing from its own history.
	const instances = listInstances(ctx, monday, nextMonday).map((o) => ({
		id: o.id,
		scheduledAt: o.scheduledAt,
		status: o.status,
		timing: o.timing,
		completedAt: o.completedAt,
		notes: o.notes,
		slotId: o.slotId,
		slotMode: o.mode,
		slotLabel: o.label,
		slotStartTime: o.startTime,
		slotDuration: o.durationMinutes,
		categoryId: o.categoryId,
		categoryName: o.categoryName,
		activityId: o.activityId,
		activityName: o.activityName
	}));

	const instancesByDay: Record<number, typeof instances> = {};
	for (const inst of instances) {
		const dayOfWeek = new Date(inst.scheduledAt).getDay();
		const weekdayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		(instancesByDay[weekdayIdx] ??= []).push(inst);
	}

	const done = instances.filter((i) => i.status === 'done');
	const summary = {
		total: instances.length,
		done: done.length,
		doing: instances.filter((i) => i.status === 'doing').length,
		skipped: instances.filter((i) => i.status === 'skipped').length,
		todo: instances.filter((i) => i.status === 'todo').length,
		late: done.filter((i) => i.timing === 'late').length,
		early: done.filter((i) => i.timing === 'early').length
	};

	return { instancesByDay, weekMeta, weekdays: WEEKDAYS, days, summary };
};
