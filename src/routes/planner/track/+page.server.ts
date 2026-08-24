import type { Actions, PageServerLoad } from './$types';
import { listActivities, listCategories } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import {
	deleteInstance,
	generateInstances,
	listForDate,
	listInstances,
	resolveInstanceActivity,
	setInstanceDuration,
	setInstanceLabel,
	setInstanceStatus,
	setInstanceTime
} from '$lib/server/services/instances';
import {
	addDays,
	getISOWeekNumber,
	getISOWeekYear,
	getMonday,
	toLocalISOString
} from '$lib/server/week-generator';
import { STATUSES } from '$lib/task-status';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseWeekParam(param: string | null, now: Date): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(param + 'T00:00:00');
		if (!isNaN(parsed.getTime())) return getMonday(parsed);
	}
	return getMonday(now);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	const weekParam = url.searchParams.get('week');
	const dayParam = url.searchParams.get('day');

	const monday = parseWeekParam(weekParam, ctx.now);
	const sunday = addDays(monday, 6);
	const nextMonday = addDays(monday, 7);
	const currentMonday = getMonday(ctx.now);

	const weekNumber = getISOWeekNumber(monday);
	const weekYear = getISOWeekYear(monday);
	const isCurrent = formatDate(monday) === formatDate(currentMonday);

	const weekMeta = {
		monday: formatDate(monday),
		sunday: formatDate(sunday),
		weekNumber,
		weekYear,
		isCurrent,
		prevWeek: formatDate(addDays(monday, -7)),
		nextWeek: formatDate(nextMonday)
	};

	let selectedDayIndex: number;
	if (dayParam !== null && /^\d$/.test(dayParam)) {
		selectedDayIndex = Math.min(Math.max(Number(dayParam), 0), 6);
	} else {
		const dow = ctx.now.getDay();
		selectedDayIndex = dow === 0 ? 6 : dow - 1;
	}

	const selectedDate = addDays(monday, selectedDayIndex);

	// Generate for the week actually being viewed. The old code only ever
	// generated the current one, so paging forward showed an empty week.
	generateInstances(ctx, monday, nextMonday);

	const tasks = listForDate(ctx, selectedDate);
	const categoryNames = new Map(listCategories(ctx).map((c) => [c.id, c.name]));
	const allActivities = listActivities(ctx, { activeOnly: true })
		.map((a) => ({
			id: a.id,
			name: a.name,
			categoryId: a.categoryId,
			categoryName: categoryNames.get(a.categoryId) ?? ''
		}))
		.sort((a, b) => a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name));

	// Counted from the same source the list is built from, so a day tab can no
	// longer disagree with the rows underneath it.
	const weekOccurrences = listInstances(ctx, monday, nextMonday);
	const taskCountByDay: Record<number, number> = {};
	for (const o of weekOccurrences) {
		const d = new Date(o.scheduledAt);
		const dow = d.getDay();
		const idx = dow === 0 ? 6 : dow - 1;
		taskCountByDay[idx] = (taskCountByDay[idx] || 0) + 1;
	}

	const todayDow = ctx.now.getDay();
	const todayDayIndex = todayDow === 0 ? 6 : todayDow - 1;

	return {
		tasks,
		activities: allActivities,
		categories: listCategories(ctx),
		now: toLocalISOString(ctx.now),
		weekMeta,
		weekdays: WEEKDAYS,
		selectedDayIndex,
		todayDayIndex,
		taskCountByDay,
		selectedDate: formatDate(selectedDate),
		validStatuses: STATUSES
	};
};

export const actions: Actions = {
	updateStatus: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setInstanceStatus(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('status')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateLabel: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setInstanceLabel(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('label')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	resolveActivity: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			resolveInstanceActivity(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('activityId')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateScheduledAt: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setInstanceTime(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('time'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateDuration: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setInstanceDuration(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('minutes')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteTask: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteInstance(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
