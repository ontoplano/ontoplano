import type { Actions, PageServerLoad } from './$types';
import {
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	quoteForDate,
	visibleCards,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import {
	docsUrl,
	getHiddenSections,
	getUserSetting,
	setUserSetting,
	siteUrl
} from '$lib/server/settings';
import { loadConfig } from '$lib/server/config';
import { instanceIsEmpty, registrationMode } from '$lib/server/services/registration';
import { buildCtx } from '$lib/server/services/ctx';
import { createEntry, latestEntry, listTags } from '$lib/server/services/diary';
import { toActionFailure } from '$lib/server/http-errors';
import { listActiveOn } from '$lib/server/services/goals';
import { listHabits, today as todayOf } from '$lib/server/services/habits';
import { generateForDate, listForDate } from '$lib/server/services/instances';
import { listIdeas } from '$lib/server/services/ideas';
import { listQuotes } from '$lib/server/services/quotes';
import { reviewPending } from '$lib/server/services/review';
import { listToBuy } from '$lib/server/services/shopping';
import { listBills, listPayments, monthSummary } from '$lib/server/services/bills';
import { listWorkouts } from '$lib/server/services/workouts';
import { getCurrency } from '$lib/server/settings';
import { listActiveWeeklySlots } from '$lib/server/services/slots';
import { listTodos } from '$lib/server/services/todos';
import { listWins, saveWins } from '$lib/server/services/wins';
import { generateCurrentWeek } from '$lib/server/week-generator';

export const load: PageServerLoad = async ({ locals }) => {
	/*
	 * Signed out, this is the pitch rather than the dashboard.
	 *
	 * None of the work below applies — there is no account to generate a week
	 * for — so it returns early rather than guarding twenty fields.
	 */
	if (!locals.user) {
		/*
		 * A door, not a pitch.
		 *
		 * Everything this used to assemble — the price, the trial length, the
		 * video, the demo link — was for the landing page, which now lives at
		 * ontoplano.com in a repository of its own. What is left is the one fact
		 * the door needs: whether there is any point offering a Register button.
		 */
		return {
			frontDoor: {
				canRegister: instanceIsEmpty() || registrationMode() !== 'closed',
				// The operator's sentence, not the app's — see config.toml.
				tagline: loadConfig().instance.tagline,
				// Where this deployment's own site and docs are. Production
				// answers with the project's; staging answers with staging's.
				siteUrl: siteUrl(),
				docsUrl: docsUrl()
			}
		};
	}

	const ctx = buildCtx(locals.user.id);
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
