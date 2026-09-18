import type { IsolatedEvent } from '$lib/isolated/routes';
import { host } from '$lib/services/host';
import {
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	quoteForDate,
	visibleCards,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import { getHiddenSections, getUserSetting, setUserSetting } from '$lib/services/settings';
import { buildCtx } from '$lib/services/ctx';
import { createEntry, latestEntry, listTags } from '$lib/services/diary';
import { toActionFailure } from '$lib/http-errors';
import { listActiveOn } from '$lib/services/goals';
import { listHabits, today as todayOf } from '$lib/services/habits';
import { generateForDate, listForDate } from '$lib/services/instances';
import { listIdeas } from '$lib/services/ideas';
import { listQuotes } from '$lib/services/quotes';
import { reviewPending } from '$lib/services/review';
import { listToBuy } from '$lib/services/inventory';
import { listBills, listPayments, monthSummary } from '$lib/services/bills';
import { listWorkouts } from '$lib/services/workouts';
import { getCurrency } from '$lib/services/settings';
import { listActiveWeeklySlots } from '$lib/services/slots';
import { listTodos } from '$lib/services/todos';
import { listWins, saveWins } from '$lib/services/wins';
import { generateCurrentWeek } from '$lib/services/week-generator';

/**
 * The dashboard, for whoever is signed in — which on an isolated instance is
 * whoever is holding the device. The signed-out front door stays in
 * +page.server.ts: whether anyone may register is a question about a
 * deployment, and an isolated instance has no door.
 */
export const load = async ({ locals }: IsolatedEvent) => {
	/*
	 * Signed out, this is a door rather than the dashboard.
	 *
	 * Everything the door needs is a fact about a deployment — whether
	 * registration is open, the operator's tagline, where this instance's site
	 * and docs are — so it comes through the host seam. An isolated instance
	 * answers null, because the person holding the device is the account and
	 * there is nobody to sign in.
	 */
	if (!locals.user) {
		const door = host.frontDoor();
		if (door) return { frontDoor: door };
	}

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
		todo: todayTasks.filter((t) => t.status === 'todo').length
		// Timing describes the finished ones, so it is counted among them rather
		// than sitting alongside the states.
	};

	// Hidden sections take their dashboard cards along — filtered on read,
	// never written back, so turning a section on brings its card straight back.
	const hiddenSections = getHiddenSections(ctx.userId);
	const cards = visibleCards(hiddenSections);

	return {
		/** Null here is what tells the page it is the dashboard rather than the door. */
		frontDoor: null,
		// A layout the user has never set falls back to the registry defaults, so
		// a new account meets a sensible dashboard rather than an empty one.
		layout: parseLayout(getUserSetting(ctx.userId, DASHBOARD_LAYOUT_KEY)).filter((id) =>
			cards.some((c) => c.id === id)
		),
		cards,
		hiddenSections,
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
		workoutsCard: listWorkouts(ctx).map((t) => ({
			id: t.id,
			title: t.title,
			kind: t.categoryName,
			lastDoneAt: t.lastDoneAt
		})),
		billsCard: (() => {
			const month = `${ctx.now.getUTCFullYear()}-${String(ctx.now.getUTCMonth() + 1).padStart(2, '0')}`;
			const monthly = listBills(ctx).filter((b) => b.rhythm === 'monthly');
			const paid = new Set(
				monthly
					.flatMap((b) => listPayments(ctx, b.id))
					.filter((p) => p.period === month)
					.map((p) => p.billId)
			);
			return {
				currency: getCurrency(ctx.userId),
				summary: monthSummary(ctx, month),
				open: monthly
					.filter((b) => !paid.has(b.id))
					.map((b) => ({
						id: b.id,
						name: b.name,
						amountExpected: b.amountExpected,
						dueDay: b.dueDay
					}))
			};
		})(),
		/*
		 * The last few things written down, and the last few ideas.
		 *
		 * Both are "what have I been putting in here lately", which is a
		 * different question from "what is due today" and the one somebody
		 * actually opens the app with. Newest first, and the card can flip that
		 * — the oldest todo on a list is the one that has been avoided longest,
		 * which is worth being able to look at on purpose.
		 *
		 * Sliced generously rather than exactly: the card decides how many to
		 * draw, and reversing a list of eight in the browser beats a round trip.
		 */
		latestTodos: listTodos(ctx)
			.filter((t) => t.status === 'todo' || t.status === 'doing')
			.slice()
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, 12),
		latestIdeas: listIdeas(ctx).slice(0, 12),
		/** Set when last week had blocks in it and nobody has written it up yet. */
		pendingReview: reviewPending(ctx),
		weekSlots: listActiveWeeklySlots(ctx),
		today
	};
};

export const actions = {
	createDiaryEntry: async ({ request, locals }: IsolatedEvent) => {
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

	saveWins: async ({ request, locals }: IsolatedEvent) => {
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

	setLayout: async ({ request, locals }: IsolatedEvent) => {
		const formData = await request.formData();
		const ids = formData.getAll('card').map((v) => String(v)) as DashboardCardId[];
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(ids));
		return { success: true };
	},

	resetLayout: async ({ locals }: IsolatedEvent) => {
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(defaultLayout()));
		return { success: true };
	}
};
