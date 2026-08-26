import type { Actions, PageServerLoad } from './$types';
import {
	DASHBOARD_CARDS,
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	quoteForDate,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import { getUserSetting, setUserSetting } from '$lib/server/settings';
import { buildCtx } from '$lib/server/services/ctx';
import { createEntry, latestEntry, listTags } from '$lib/server/services/diary';
import { toActionFailure } from '$lib/server/services/errors';
import { listActiveOn } from '$lib/server/services/goals';
import { listHabits, today as todayOf } from '$lib/server/services/habits';
import { generateForDate, listForDate } from '$lib/server/services/instances';
import { listQuotes } from '$lib/server/services/quotes';
import { listToBuy } from '$lib/server/services/shopping';
import { listActiveWeeklySlots } from '$lib/server/services/slots';
import { listWins, saveWins } from '$lib/server/services/wins';
import { generateCurrentWeek } from '$lib/server/week-generator';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const today = todayOf(ctx);

	generateCurrentWeek(ctx);
	generateForDate(ctx, ctx.now);

	// One call, both kinds of block. The union that used to live here is why
	// one-offs were missing from this card in the first place.
	const todayTasks = listForDate(ctx, ctx.now).map((o) => ({
		id: o.id,
		kind: o.kind,
		startTime: o.startTime,
		durationMinutes: o.durationMinutes,
		name: o.title,
		status: o.status,
		timing: o.timing,
		categoryName: o.categoryName,
		categoryColor: o.categoryColor
	}));

	/**
	 * The block you are in, or the next one.
	 *
	 * The card above this used to open with "0 / 11 · 11 to go" — a number about
	 * the past, at the top of the screen somebody opens to find out what to do
	 * next. This is the answer to the question they came with.
	 */
	const nowMinutes = ctx.now.getHours() * 60 + ctx.now.getMinutes();
	const minutesOf = (time: string) => {
		const [h, m] = time.split(':').map(Number);
		return h * 60 + (m || 0);
	};

	const open = todayTasks.filter((t) => t.status === 'todo' || t.status === 'doing');
	const current =
		open.find((t) => {
			const from = minutesOf(t.startTime);
			return nowMinutes >= from && nowMinutes < from + (t.durationMinutes ?? 30);
		}) ?? null;
	const next = current ? null : (open.find((t) => minutesOf(t.startTime) >= nowMinutes) ?? null);

	const now = current
		? {
				task: current,
				state: 'now' as const,
				minutes: minutesOf(current.startTime) + (current.durationMinutes ?? 30) - nowMinutes
			}
		: next
			? { task: next, state: 'next' as const, minutes: minutesOf(next.startTime) - nowMinutes }
			: null;

	const done = todayTasks.filter((t) => t.status === 'done');
	const taskSummary = {
		total: todayTasks.length,
		done: done.length,
		doing: todayTasks.filter((t) => t.status === 'doing').length,
		skipped: todayTasks.filter((t) => t.status === 'skipped').length,
		todo: todayTasks.filter((t) => t.status === 'todo').length,
		// Timing describes the finished ones, so it is counted among them rather
		// than sitting alongside the states.
		late: done.filter((t) => t.timing === 'late').length,
		early: done.filter((t) => t.timing === 'early').length
	};

	return {
		// A layout the user has never set falls back to the registry defaults, so
		// a new account meets a sensible dashboard rather than an empty one.
		layout: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)),
		cards: DASHBOARD_CARDS,
		quote: quoteForDate(listQuotes(ctx), today),
		wins: listWins(ctx, today),
		// Goals whose period covers today — the week's and the year's alike, since
		// the point is that they are all live at once.
		activeGoals: listActiveOn(ctx, today),
		lastEntry: latestEntry(ctx),
		allTags: listTags(ctx).map((t) => ({ id: t.id, name: t.name })),
		taskSummary,
		now,
		todayTasks,
		/** Still to be done today, in the order they come up. */
		tasksTodo: todayTasks.filter((t) => t.status === 'todo' || t.status === 'doing'),
		habitStreaks: listHabits(ctx).map((h) => ({
			id: h.id,
			name: h.name,
			type: h.type,
			streak: h.streak
		})),
		shoppingToBuy: listToBuy(ctx),
		weekSlots: listActiveWeeklySlots(ctx),
		today
	};
};

export const actions: Actions = {
	createDiaryEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createEntry(buildCtx(locals.user!.id), {
				content: formData.get('content'),
				tags: formData.get('tags')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	saveWins: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			saveWins(buildCtx(locals.user!.id), {
				forDate: formData.get('forDate'),
				contents: [formData.get('win_1'), formData.get('win_2'), formData.get('win_3')]
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setLayout: async ({ request, locals }) => {
		const formData = await request.formData();
		const ids = formData.getAll('card').map((v) => String(v)) as DashboardCardId[];
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(ids));
		return { success: true };
	},

	resetLayout: async ({ locals }) => {
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(defaultLayout()));
		return { success: true };
	}
};
