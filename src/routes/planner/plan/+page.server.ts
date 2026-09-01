import { fail } from '@sveltejs/kit';
import { applyTemplate, TEMPLATE_KEYS, TEMPLATES } from '$lib/server/services/onboarding';
import { oneOf } from '$lib/server/services/validate';
import type { Actions, PageServerLoad } from './$types';
import { ratingsFromForm } from '$lib/ratings';
import { listActivities, listCategories } from '$lib/server/services/activities';
import { buildCtx, type Ctx } from '$lib/server/services/ctx';
import { ServiceError, toActionFailure } from '$lib/server/services/errors';
import { metaFromFormData, metaPatchFromFormData } from '$lib/server/services/meta';
import { listManifests } from '$lib/server/services/plugins';
import {
	addFeed,
	listFeeds,
	refreshFeed,
	refreshStale,
	removeFeed,
	subscribedEvents
} from '$lib/server/services/calendars';
import {
	applyScheme,
	deleteScheme,
	listSchemes,
	renameScheme,
	saveScheme
} from '$lib/server/services/schemes';
import {
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
import {
	demoteToTodo,
	listForDate,
	listUnscheduled,
	promoteTodo
} from '$lib/server/services/todos';
import { addDays } from '$lib/server/week-generator';
import { getGridHours } from '$lib/server/settings';

/**
 * What the browser last knew about its own width.
 *
 * Not a preference and not a setting — a fact about the screen, written by the
 * page that can see one, read by the render that cannot.
 */
// Not exported: a `+page.server.ts` may only export what SvelteKit names.
const NARROW_COOKIE = 'onto_narrow';

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

/**
 * The strip beside the grid: everything waiting for a time.
 *
 * Undated todos, and also the ones already pulled onto today or left behind on
 * an earlier day. Those had nowhere on this page at all — a todo due today is
 * exactly the thing somebody opens the planner to place, and it was visible
 * only on the board. Today's come first because they are the ones being asked
 * about; the undated pile is what is left.
 */
function trayTodos(ctx: Ctx, today: string) {
	const dated = listForDate(ctx, today)
		.filter((t) => t.status === 'todo' || t.status === 'doing')
		.map((t) => ({
			...t,
			due: t.scheduledDate === today ? ('today' as const) : ('overdue' as const)
		}));

	return [
		...dated.filter((t) => t.due === 'today'),
		...dated.filter((t) => t.due === 'overdue'),
		...listUnscheduled(ctx, { openOnly: true }).map((t) => ({ ...t, due: null }))
	];
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * Whether the URL named a view matters: without one the client shows a day on
	 * a phone, where a week of columns is seven strips of truncated text.
	 *
	 * And the server has to know which it will be, or the phone is served a week,
	 * paints it, and swaps to a day the moment the script runs — the Week button
	 * lighting up and going out again on every visit. The browser writes what it
	 * is on first sight; from then on the first paint is already right. A cookie
	 * because it has to arrive with the request, and nothing else does.
	 */
	const narrow = cookies.get(NARROW_COOKIE) === '1';
	const requestedView = url.searchParams.get('view');
	const view: PlanView =
		requestedView === 'day' || requestedView === 'month'
			? requestedView
			: requestedView === 'week'
				? 'week'
				: narrow
					? 'day'
					: 'week';
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

	// Before anything is read, so a stale copy is not what gets drawn. A failure
	// is written to the feed's row rather than thrown; the planner is not going
	// down because somebody's calendar server is.
	await refreshStale(ctx);

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
		// The stretch of the day this account asked the grid to draw.
		gridHours: getGridHours(ctx.userId),
		/*
		 * The strip beside the grid: everything waiting for a time.
		 *
		 * Undated todos, and also the ones already pulled onto today or left
		 * behind on an earlier day. Those had nowhere on this page at all — a
		 * todo due today is exactly the thing somebody opens the planner to
		 * place, and it was visible only on the board. They are marked so the
		 * strip can say which is which; the undated ones are the general pile.
		 */
		todos: trayTodos(ctx, formatDate(today)),
		slots: listWeeklySlots(ctx),
		range,
		view,
		viewExplicit,
		categories: listCategories(ctx),
		activities: listActivities(ctx, { activeOnly: true }),
		schemes: listSchemes(ctx),
		// The starter weeks onboarding offers, offered again.
		templates: TEMPLATES.map((t) => ({ key: t.key, label: t.label, description: t.description })),
		weekdays: WEEKDAYS,
		today: formatDate(today),
		suppressions: listSuppressions(ctx, formatDate(from), formatDate(to)),
		exceptionals: listExceptionals(ctx, formatDate(from), formatDate(to)),
		/**
		 * Calendars somebody else controls, drawn where they will get in the way.
		 *
		 * Refreshed here rather than by a scheduler: a feed is only worth fetching
		 * for somebody who is looking at it, and a self-hosted box should not need
		 * a background job kept alive to make the planner honest.
		 */
		feeds: listFeeds(ctx),
		subscribed: subscribedEvents(ctx, from, to)
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

	addCalendar: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const id = addFeed(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				url: formData.get('url'),
				color: formData.get('color')
			});
			// Fetch it now, so adding one shows whether the address works.
			await refreshFeed(buildCtx(locals.user!.id), id);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removeCalendar: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			removeFeed(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	applyTemplate: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			applyTemplate(
				buildCtx(locals.user!.id),
				oneOf(formData.get('key'), 'template', TEMPLATE_KEYS),
				{
					replacePlan: true
				}
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveScheme: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveScheme(buildCtx(locals.user!.id), formData.get('label'));
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
				formData.get('label')
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

	/**
	 * A block dragged off the grid and back onto the todo strip.
	 *
	 * The reverse of `scheduleTodo`, and the reason the strip is a drop target:
	 * scheduling used to be one-way, so changing your mind meant deleting the
	 * block and typing it in again.
	 */
	unscheduleBlock: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing block id' });

		try {
			demoteToTodo(buildCtx(locals.user!.id), id);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
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
