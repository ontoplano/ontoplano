import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure, ValidationError } from '$lib/server/services/errors';
import {
	carryIntoTodos,
	goalsTouched,
	LINES_PER_REVIEW,
	listLines,
	pastLines,
	readWeek,
	saveLines,
	weekStartOf
} from '$lib/server/services/review';
import {
	completeStale,
	dropStale,
	keepStale,
	listStale,
	STALE_MONTHS
} from '$lib/server/services/stale';
import { addDays, getISOWeekNumber, getISOWeekYear } from '$lib/server/week-generator';

function dateString(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Last week by default.
 *
 * You review a week once it is over; landing on the current one would invite
 * writing three lines about a Wednesday.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const param = url.searchParams.get('week');
	const weekStart = param
		? weekStartOf(param, ctx.now)
		: weekStartOf(dateString(addDays(ctx.now, -7)), ctx.now);

	const monday = new Date(weekStart + 'T00:00:00');
	const { reading, loose } = readWeek(ctx, weekStart);
	const isCurrent = weekStart === weekStartOf(dateString(ctx.now), ctx.now);

	return {
		reading,
		loose,
		goals: goalsTouched(ctx, weekStart),
		lines: listLines(ctx, weekStart),
		/** What you wrote in the weeks before this one, so it is not written into a void. */
		past: pastLines(ctx, { limit: 8, before: weekStart }),
		/** Things nothing has ever asked about. Only offered on a finished week. */
		stale: isCurrent ? [] : listStale(ctx),
		staleMonths: STALE_MONTHS,
		linesPerReview: LINES_PER_REVIEW,
		week: {
			number: getISOWeekNumber(monday),
			year: getISOWeekYear(monday),
			prev: dateString(addDays(monday, -7)),
			next: dateString(addDays(monday, 7)),
			isCurrent
		}
	};
};

/** Which table a stale row came from. Anything else is not a table. */
function sortOf(raw: FormDataEntryValue | null): 'todo' | 'idea' | 'shopping' {
	const v = String(raw ?? '');
	if (v === 'todo' || v === 'idea' || v === 'shopping') return v;
	throw new ValidationError('Unknown kind');
}

export const actions: Actions = {
	saveLines: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveLines(buildCtx(locals.user!.id), {
				weekStart: formData.get('weekStart'),
				contents: formData.getAll('line')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	keepStale: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			keepStale(
				buildCtx(locals.user!.id),
				sortOf(formData.get('sort')),
				Number(formData.get('id'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	completeStale: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			completeStale(
				buildCtx(locals.user!.id),
				sortOf(formData.get('sort')),
				Number(formData.get('id'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	dropStale: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			dropStale(
				buildCtx(locals.user!.id),
				sortOf(formData.get('sort')),
				Number(formData.get('id'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	carry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const carried = carryIntoTodos(
				buildCtx(locals.user!.id),
				weekStartOf(formData.get('weekStart'), new Date()),
				formData.getAll('instanceId')
			);
			return { success: true, carried };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
