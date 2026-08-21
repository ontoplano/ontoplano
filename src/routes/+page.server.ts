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
		categoryName: o.categoryName,
		categoryColor: o.categoryColor
	}));

	const taskSummary = {
		total: todayTasks.length,
		completed: todayTasks.filter((t) => t.status === 'completed').length,
		delayed: todayTasks.filter((t) => t.status === 'delayed').length,
		early: todayTasks.filter((t) => t.status === 'early').length,
		skipped: todayTasks.filter((t) => t.status === 'skipped').length,
		pending: todayTasks.filter((t) => t.status === 'pending').length
	};

	/** Still to be done today, in the order they come up. */
	const tasksTodo = todayTasks.filter((t) => t.status === 'pending');

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

	return {
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

	createWins: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const forDate = formData.get('forDate')?.toString()?.trim() || todayStr();

		const wins: string[] = [];
		for (let i = 0; ; i++) {
			const val = formData.get(`win_${i}`)?.toString()?.trim();
			if (val === undefined || val === null) break;
			if (val) wins.push(val);
		}

		if (wins.length === 0) return fail(400, { message: 'At least one win is required' });

		const content = wins.map((w, i) => `Win ${i + 1}: ${w}`).join('\n');

		const maxSeq =
			db
				.select({ value: max(diaryEntries.seq) })
				.from(diaryEntries)
				.where(eq(diaryEntries.userId, userId))
				.get()?.value ?? 0;
		const seq = maxSeq + 1;

		const result = db.insert(diaryEntries).values({ userId, content, seq, forDate }).run();
		const entryId = Number(result.lastInsertRowid);

		const tagIds = ensureTagIds(['3w'], userId);
		linkDiaryTags(entryId, tagIds);

		return { success: true };
	}
};
