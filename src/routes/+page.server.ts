import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	diaryEntries,
	tags,
	diaryEntryTags,
	habits,
	habitOccurrences,
	shoppingItems,
	weeklySlots,
	activities,
	categories
} from '$lib/server/db/schema';
import { eq, and, desc, max } from 'drizzle-orm';
import { generateCurrentWeek } from '$lib/server/week-generator';
import { generateForDate, listForDate } from '$lib/server/services/instances';
import { listActiveOn } from '$lib/server/services/goals';
import { dailyWins, quotes } from '$lib/server/db/schema';
import {
	DASHBOARD_LAYOUT_KEY,
	defaultLayout,
	parseLayout,
	quoteForDate,
	serialiseLayout,
	type DashboardCardId
} from '$lib/dashboard';
import { getUserSetting, setUserSetting } from '$lib/server/settings';
import { parseTags, ensureTagIds, linkDiaryTags } from '$lib/server/tags';

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
	const da = new Date(a + 'T00:00:00');
	const db_ = new Date(b + 'T00:00:00');
	return Math.floor((db_.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	generateCurrentWeek(userId);

	const lastEntry = db
		.select({
			id: diaryEntries.id,
			content: diaryEntries.content,
			createdAt: diaryEntries.createdAt
		})
		.from(diaryEntries)
		.where(eq(diaryEntries.userId, userId))
		.orderBy(desc(diaryEntries.createdAt))
		.limit(1)
		.get();

	let lastEntryTags: { id: number; name: string }[] = [];
	if (lastEntry) {
		lastEntryTags = db
			.select({ id: tags.id, name: tags.name })
			.from(diaryEntryTags)
			.innerJoin(tags, eq(diaryEntryTags.tagId, tags.id))
			.where(and(eq(diaryEntryTags.entryId, lastEntry.id), eq(tags.userId, userId)))
			.all();
	}

	const allTags = db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.userId, userId))
		.orderBy(tags.name)
		.all();

	const today = todayStr();
	generateForDate(userId, new Date());

	// One call, both kinds of block. The union that used to live here is why
	// one-offs were missing from this card in the first place.
	const todayTasks = listForDate(userId, new Date()).map((o) => ({
		id: o.id,
		kind: o.kind,
		startTime: o.startTime,
		name: o.title,
		status: o.status,
		timing: o.timing,
		categoryName: o.categoryName,
		categoryColor: o.categoryColor
	}));

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

	/** Still to be done today, in the order they come up. */
	const tasksTodo = todayTasks.filter((t) => t.status === 'todo' || t.status === 'doing');

	const userHabits = db
		.select({
			id: habits.id,
			name: habits.name,
			type: habits.type,
			createdAt: habits.createdAt
		})
		.from(habits)
		.where(eq(habits.userId, userId))
		.orderBy(habits.name)
		.all();

	const habitStreaks = userHabits.map((habit) => {
		const occurrences = db
			.select({ date: habitOccurrences.date })
			.from(habitOccurrences)
			.where(eq(habitOccurrences.habitId, habit.id))
			.orderBy(desc(habitOccurrences.date))
			.all();

		let streak: number;
		if (habit.type === 'bad') {
			if (occurrences.length === 0) {
				streak = daysBetween(habit.createdAt.slice(0, 10), today);
			} else {
				streak = daysBetween(occurrences[0].date, today);
			}
		} else {
			const completedDates = new Set(occurrences.map((o) => o.date));
			streak = 0;
			const d = new Date(today + 'T00:00:00');
			for (let i = 0; i < 365; i++) {
				const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
				if (completedDates.has(dateStr)) {
					streak++;
				} else if (i > 0) {
					break;
				}
				d.setDate(d.getDate() - 1);
			}
		}

		return { id: habit.id, name: habit.name, type: habit.type, streak };
	});

	const shoppingToBuy = db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			type: shoppingItems.type
		})
		.from(shoppingItems)
		.where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.bought, false)))
		.orderBy(desc(shoppingItems.createdAt))
		.all();

	const weekSlots = db
		.select({
			id: weeklySlots.id,
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			durationMinutes: weeklySlots.durationMinutes,
			mode: weeklySlots.mode,
			label: weeklySlots.label,
			activityName: activities.name,
			categoryName: categories.name,
			categoryColor: categories.color
		})
		.from(weeklySlots)
		.leftJoin(activities, eq(weeklySlots.activityId, activities.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.where(and(eq(weeklySlots.userId, userId), eq(weeklySlots.active, true)))
		.orderBy(weeklySlots.startTime)
		.all();

	// Goals whose period covers today — the week's and the year's alike, since
	// the point is that they are all live at once.
	const activeGoals = listActiveOn(userId, today);

	// A layout the user has never set falls back to the registry defaults, so a
	// new account meets a sensible dashboard rather than an empty one.
	const layout = parseLayout(getUserSetting(userId, DASHBOARD_LAYOUT_KEY));

	const userQuotes = db
		.select({ id: quotes.id, text: quotes.text, author: quotes.author })
		.from(quotes)
		.where(eq(quotes.userId, userId))
		.orderBy(quotes.id)
		.all();

	const wins = db
		.select({ position: dailyWins.position, content: dailyWins.content })
		.from(dailyWins)
		.where(and(eq(dailyWins.userId, userId), eq(dailyWins.forDate, today)))
		.all();

	return {
		layout,
		quote: quoteForDate(userQuotes, today),
		wins,
		activeGoals,
		lastEntry: lastEntry ? { ...lastEntry, tags: lastEntryTags } : null,
		allTags,
		taskSummary,
		todayTasks,
		tasksTodo,
		habitStreaks,
		shoppingToBuy,
		weekSlots,
		today
	};
};

export const actions: Actions = {
	createDiaryEntry: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const tagsStr = formData.get('tags')?.toString()?.trim() ?? '';

		if (!content) return fail(400, { message: 'Content is required' });

		const maxSeq =
			db
				.select({ value: max(diaryEntries.seq) })
				.from(diaryEntries)
				.where(eq(diaryEntries.userId, userId))
				.get()?.value ?? 0;
		const seq = maxSeq + 1;

		const result = db.insert(diaryEntries).values({ userId, content, seq }).run();
		const entryId = Number(result.lastInsertRowid);

		const tagNames = parseTags(tagsStr);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames, userId);
			linkDiaryTags(entryId, tagIds);
		}

		return { success: true };
	},

	/**
	 * Three wins for today.
	 *
	 * Upserted by (date, position) so re-saving edits the same three rows
	 * instead of accumulating duplicates, and an emptied box removes its win
	 * rather than storing a blank.
	 */
	saveWins: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const forDate = formData.get('forDate')?.toString()?.trim() || todayStr();

		db.transaction((tx) => {
			for (let position = 1; position <= 3; position++) {
				const content = formData.get(`win_${position}`)?.toString()?.trim() ?? '';
				tx.delete(dailyWins)
					.where(
						and(
							eq(dailyWins.userId, userId),
							eq(dailyWins.forDate, forDate),
							eq(dailyWins.position, position)
						)
					)
					.run();
				if (content) tx.insert(dailyWins).values({ userId, forDate, position, content }).run();
			}
		});

		return { success: true };
	},

	setLayout: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const ids = formData.getAll('card').map((v) => String(v)) as DashboardCardId[];
		setUserSetting(userId, DASHBOARD_LAYOUT_KEY, serialiseLayout(ids));
		return { success: true };
	},

	resetLayout: async ({ locals }) => {
		setUserSetting(locals.user!.id, DASHBOARD_LAYOUT_KEY, serialiseLayout(defaultLayout()));
		return { success: true };
	}
};
