import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { ratingsFromForm } from '$lib/ratings';
import { listActivities, listCategories } from '$lib/server/services/activities';
import { buildCtx, type Ctx } from '$lib/server/services/ctx';
import { ServiceError, toActionFailure } from '$lib/server/services/errors';
import { metaFromFormData, metaPatchFromFormData } from '$lib/server/services/meta';
import { listManifests } from '$lib/server/services/plugins';
import {
	applyScheme,
	deleteScheme,
	listSchemes,
	renameScheme,
	saveScheme
} from '$lib/server/services/schemes';
import {
	clearWeeklyPlan,
	convertRepeat,
	copySlotsToWeekdays,
	createExceptional,
	createSlot,
	deleteExceptional,
	deleteSlots,
	importWeekCsv,
	listExceptionals,
	listSuppressions,
	listWeeklySlots,
	moveOccurrence,
	readRecurrence,
	suppressOccurrence,
	toggleSlotActive,
	unsuppressOccurrence,
	updateExceptional,
	updateSlot
} from '$lib/server/services/slots';
import { listUnscheduled, promoteTodo } from '$lib/server/services/todos';
import { addDays } from '$lib/server/week-generator';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * How much of the plan is on screen.
 *
 * A week is the default because that is what the plan *is*. A day is what a
 * phone can show honestly, and a month is for looking rather than editing —
 * six rows so every month fits whatever weekday it starts on.
 */
const SPAN_DAYS = { day: 1, week: 7, month: 42 } as const;
type PlanView = keyof typeof SPAN_DAYS;

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Start of the visible window, clamped so it never begins before today.
 *
 * The plan is what you are going to do; a window anchored on Monday puts
 * Monday to Wednesday of a Thursday in the past, where planning is pointless.
 * Anchoring on today makes every visible column actionable, and the seven-day
 * span still shows each weekday once, so recurring slots all remain reachable.
 */
/** A date from the URL, or today. Unclamped — the caller decides. */
function parseAnchor(param: string | null, today: Date): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(`${param}T00:00:00`);
		if (!isNaN(parsed.getTime())) return parsed;
	}
	return today;
}

/** The Monday on or before the first of this date's month. */
function monthGridStart(date: Date): Date {
	const first = new Date(date.getFullYear(), date.getMonth(), 1);
	first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
	return first;
}

function parseFromParam(param: string | null, today: Date): Date {
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
		const parsed = new Date(`${param}T00:00:00`);
		if (!isNaN(parsed.getTime()) && parsed.getTime() > today.getTime()) return parsed;
	}
	return today;
}

/**
 * Slot metadata, turning a validation failure into a form error rather than
 * letting it escape the action and surface as a 500.
 */
function readMeta(formData: FormData): { meta: string } | { message: string } {
	try {
		return { meta: metaFromFormData(formData) };
	} catch (e) {
		return { message: e instanceof ServiceError ? e.message : 'Invalid options' };
	}
}

function readMetaPatch(formData: FormData): { meta: string | undefined } | { message: string } {
	try {
		return { meta: metaPatchFromFormData(formData) };
	} catch (e) {
		return { message: e instanceof ServiceError ? e.message : 'Invalid options' };
	}
}

/** The fields both block forms share, in the shape the service expects. */
function blockFields(formData: FormData) {
	return {
		startTime: formData.get('startTime'),
		durationMinutes: formData.get('durationMinutes'),
		mode: formData.get('mode'),
		categoryId: formData.get('categoryId'),
		activityId: formData.get('activityId'),
		newActivityName: formData.get('newActivityName'),
		newActivityCategoryId: formData.get('newActivityCategoryId'),
		label: formData.get('label'),
		ratings: ratingsFromForm(formData)
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	// Whether the URL named a view matters: without one the client shows a day on
	// a phone, where a week of columns is seven strips of truncated text.
	const requestedView = url.searchParams.get('view');
	const view: PlanView =
		requestedView === 'day' || requestedView === 'month' ? requestedView : 'week';
	const viewExplicit =
		requestedView === 'day' || requestedView === 'week' || requestedView === 'month';
	const span = SPAN_DAYS[view];

	const today = startOfDay(ctx.now);
	// A month is read more than edited, so it starts where the month does rather
	// than being clamped forward to today like a plan you are still writing.
	const from =
		view === 'month'
			? monthGridStart(parseAnchor(url.searchParams.get('from'), today))
			: parseFromParam(url.searchParams.get('from'), today);
	const to = addDays(from, span);

	const days = Array.from({ length: span }, (_, offset) => {
		const d = addDays(from, offset);
		const weekday = (d.getDay() + 6) % 7;
		return {
			date: formatDate(d),
			weekday,
			name: WEEKDAYS[weekday],
			isToday: formatDate(d) === formatDate(today)
		};
	});

	// Stepping back is clamped to today rather than hidden, so the button still
	// returns you to the live window from anywhere ahead of it. A month may go
	// backwards: there is nothing to plan there, but plenty to look at.
	const prevFrom = addDays(from, -span);
	const range = {
		from: formatDate(from),
		last: formatDate(addDays(from, span - 1)),
		isCurrent:
			view === 'month'
				? formatDate(from) === formatDate(monthGridStart(today))
				: formatDate(from) === formatDate(today),
		prev:
			view === 'month'
				? formatDate(monthGridStart(addDays(from, -1)))
				: formatDate(from) === formatDate(today)
					? null
					: formatDate(prevFrom.getTime() < today.getTime() ? today : prevFrom),
		next: view === 'month' ? formatDate(monthGridStart(addDays(to, 1))) : formatDate(to),
		days
	};

	return {
		// So the metadata editor can say which plugin reads which key.
		plugins: listManifests(ctx.userId).map((m) => ({ name: m.name, metaKeys: m.metaKeys })),
		// Undated todos, so one can be dragged straight onto an hour.
		todos: listUnscheduled(ctx, { openOnly: true }),
		slots: listWeeklySlots(ctx),
		range,
		view,
		viewExplicit,
		categories: listCategories(ctx),
		activities: listActivities(ctx, { activeOnly: true }),
		schemes: listSchemes(ctx),
		weekdays: WEEKDAYS,
		today: formatDate(today),
		suppressions: listSuppressions(ctx, formatDate(from), formatDate(to)),
		exceptionals: listExceptionals(ctx, formatDate(from), formatDate(to))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const ctx: Ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		const meta = readMeta(formData);
		if ('message' in meta) return fail(400, { message: meta.message });

		try {
			const id = createSlot(ctx, {
				...blockFields(formData),
				weekday: formData.get('weekday'),
				recurrence: readRecurrence(formData, ctx.now),
				meta: meta.meta
			});
			return { success: true, id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();

		const metaPatch = readMetaPatch(formData);
		if ('message' in metaPatch) return fail(400, { message: metaPatch.message });

		try {
			updateSlot(buildCtx(locals.user!.id), Number(formData.get('id')), {
				...blockFields(formData),
				weekday: formData.get('weekday'),
				metaPatch: metaPatch.meta
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleActive: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			toggleSlotActive(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteSlots(buildCtx(locals.user!.id), [Number(formData.get('id'))]);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	bulkDelete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteSlots(buildCtx(locals.user!.id), idList(formData.get('ids')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	copyToWeekdays: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			copySlotsToWeekdays(
				buildCtx(locals.user!.id),
				idList(formData.get('ids')),
				idList(formData.get('targetDays'), { allowZero: true })
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	clearAll: async ({ locals }) => {
		try {
			clearWeeklyPlan(buildCtx(locals.user!.id));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveScheme: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveScheme(buildCtx(locals.user!.id), formData.get('name'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	loadScheme: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			applyScheme(buildCtx(locals.user!.id), Number(formData.get('schemeId')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteScheme: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteScheme(buildCtx(locals.user!.id), Number(formData.get('schemeId')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	renameScheme: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			renameScheme(
				buildCtx(locals.user!.id),
				Number(formData.get('schemeId')),
				formData.get('name')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Drop an undated todo onto the grid: it becomes a block at that hour. */
	scheduleTodo: async ({ request, locals }) => {
		const formData = await request.formData();
		const todoId = Number(formData.get('todoId'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 30);

		if (!todoId) return fail(400, { message: 'Missing todo id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });

		const result = promoteTodo(buildCtx(locals.user!.id), {
			todoId,
			date,
			startTime,
			durationMinutes
		});
		if (!result.ok) return fail(400, { message: result.message });

		return { success: true };
	},

	convertRepeat: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			convertRepeat(buildCtx(locals.user!.id), Number(formData.get('id')), {
				to: formData.get('to'),
				date: formData.get('date')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	moveOccurrence: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const id = moveOccurrence(buildCtx(locals.user!.id), {
				slotId: Number(formData.get('slotId')),
				fromDate: formData.get('fromDate'),
				date: formData.get('date'),
				startTime: formData.get('startTime'),
				durationMinutes: formData.get('durationMinutes')
			});
			return { success: true, id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	suppress: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			suppressOccurrence(
				buildCtx(locals.user!.id),
				Number(formData.get('slotId')),
				formData.get('date')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	unsuppress: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			unsuppressOccurrence(
				buildCtx(locals.user!.id),
				Number(formData.get('slotId')),
				formData.get('date')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	createExceptional: async ({ request, locals }) => {
		const formData = await request.formData();

		const meta = readMeta(formData);
		if ('message' in meta) return fail(400, { message: meta.message });

		try {
			const id = createExceptional(buildCtx(locals.user!.id), {
				...blockFields(formData),
				date: formData.get('date'),
				meta: meta.meta
			});
			return { success: true, id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateExceptional: async ({ request, locals }) => {
		const ctx: Ctx = buildCtx(locals.user!.id);
		const formData = await request.formData();

		// Same rule as `update`: a drag or resize carries placement only, and must
		// leave any metadata on the block untouched.
		const metaPatch = readMetaPatch(formData);
		if ('message' in metaPatch) return fail(400, { message: metaPatch.message });

		try {
			updateExceptional(ctx, Number(formData.get('id')), {
				...blockFields(formData),
				date: formData.get('date'),
				recurrence: formData.has('recurrenceKind') ? readRecurrence(formData, ctx.now) : undefined,
				metaPatch: metaPatch.meta
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteExceptional: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteExceptional(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	importCsv: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const result = importWeekCsv(buildCtx(locals.user!.id), {
				csv: formData.get('csv'),
				clearExisting: formData.get('clearExisting') === 'on'
			});

			return {
				success: true,
				message:
					result.unmatched.length > 0
						? `Imported ${result.imported} slots. Activities not found (used as labels): ${result.unmatched.join(', ')}`
						: `Imported ${result.imported} slots.`
			};
		} catch (e) {
			return toActionFailure(e);
		}
	}
};

/** A comma-separated id list from a bulk form. */
function idList(value: FormDataEntryValue | null, opts: { allowZero?: boolean } = {}): number[] {
	return (value?.toString() ?? '')
		.split(',')
		.map(Number)
		.filter((n) => Number.isFinite(n) && (opts.allowZero ? n >= 0 : n > 0));
}
