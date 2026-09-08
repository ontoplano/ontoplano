import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { ValidationError } from '$lib/server/services/errors';
import { toActionFailure } from '$lib/server/http-errors';
import {
	carryIntoTodos,
	goalsTouched,
	pastNotes,
	readWeek,
	resolveLoose,
	readNote,
	saveNote,
	settleWeek,
	type Verdict,
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
 * This week, by default.
 *
 * It used to open on last week, on the reasoning that a week is reviewed once
 * it is over. But the page you land on is the page you think you are looking
 * at, and landing a week behind means reading Monday's numbers as though they
 * were today's — every arrival started with working out which week this is.
 * Last week is one press of the arrow, and the dashboard links straight to it
 * when it is still open.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const param = url.searchParams.get('week');
	const weekStart = param ? weekStartOf(param, ctx.now) : weekStartOf(dateString(ctx.now), ctx.now);

	const monday = new Date(weekStart + 'T00:00:00');
	const { reading, loose } = readWeek(ctx, weekStart);
	const isCurrent = weekStart === weekStartOf(dateString(ctx.now), ctx.now);

	return {
		reading,
		loose,
		goals: goalsTouched(ctx, weekStart),
		note: readNote(ctx, weekStart),
		/** What you wrote in the weeks before this one, so it is not written into a void. */
		past: pastNotes(ctx, { limit: 8, before: weekStart }),
		/** Things nothing has ever asked about. Only offered on a finished week. */
		stale: isCurrent ? [] : listStale(ctx),
		staleMonths: STALE_MONTHS,
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
	saveNote: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveNote(buildCtx(locals.user!.id), {
				weekStart: formData.get('weekStart'),
				content: formData.get('note')
			});
			return { success: true, saved: true };
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

	/** Done, or skipped — the two answers that are not "carry it forward". */
	resolve: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const raw = String(formData.get('status') ?? '');
			if (raw !== 'done' && raw !== 'skipped') throw new ValidationError('Invalid status');

			const resolved = resolveLoose(
				buildCtx(locals.user!.id),
				weekStartOf(formData.get('weekStart'), new Date()),
				formData.getAll('instanceId'),
				raw
			);
			return { success: true, resolved };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Everything marked up on the page, applied at once.
	 *
	 * The verdicts arrive as one field per answered block —
	 * `verdict=<id>:<verb>[:<date>]` — because a form posts repeated names as a
	 * list and this is one list rather than four parallel ones that could get
	 * out of step with each other.
	 */
	settle: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const verdicts: Verdict[] = [];
			for (const raw of formData.getAll('verdict')) {
				const [id, verb, date] = String(raw).split(':');
				if (!Number.isInteger(Number(id))) continue;
				if (verb !== 'done' && verb !== 'skipped' && verb !== 'todo') continue;
				verdicts.push({ id: Number(id), verb, ...(date ? { date } : {}) });
			}

			const settled = settleWeek(
				buildCtx(locals.user!.id),
				weekStartOf(formData.get('weekStart'), new Date()),
				verdicts
			);
			return { success: true, settled };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	carry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			// A date, when the answer was "not then, but on this day". Without one
			// it lands on the undated pile, which is what carrying always meant.
			const day = String(formData.get('scheduledDate') ?? '').trim();
			const carried = carryIntoTodos(
				buildCtx(locals.user!.id),
				weekStartOf(formData.get('weekStart'), new Date()),
				formData.getAll('instanceId'),
				day || undefined
			);
			return { success: true, carried, scheduled: Boolean(day) };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
