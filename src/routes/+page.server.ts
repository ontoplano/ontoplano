import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	diaryEntries,
	tags,
	diaryEntryTags,
	taskInstances,
	habits,
	habitOccurrences,
	shoppingItems,
	weeklySlots,
	exceptionalSlots,
	activities,
	categories
} from '$lib/server/db/schema';
import { eq, and, gte, lt, desc, max, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { generateCurrentWeek, toLocalISOString } from '$lib/server/week-generator';
import { parseTags, ensureTagIds, linkDiaryTags } from '$lib/server/tags';

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayRange(): { start: string; end: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		start: toLocalISOString(start),
		end: toLocalISOString(end)
	};
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

	const { start, end } = todayRange();
	const today = todayStr();

	// What a block is *called* falls back through three levels: an explicit
	// label, then the activity (a per-instance override beats the slot's own),
	// then the category it belongs to. Same order the tracker uses.
	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');

	const weeklyToday = db
		.select({
			id: taskInstances.id,
			status: taskInstances.status,
			startTime: weeklySlots.startTime,
			label: weeklySlots.label,
			resolvedActivityName: activities.name,
			slotActivityName: slotActivities.name,
			categoryName: sql<string | null>`coalesce(${categories.name}, ${activityCategories.name})`.as(
				'effective_category_name'
			),
			categoryColor: sql<
				string | null
			>`coalesce(${categories.color}, ${activityCategories.color})`.as('effective_category_color')
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.leftJoin(activities, eq(taskInstances.resolvedActivityId, activities.id))
		.where(
			and(
				eq(taskInstances.userId, userId),
				gte(taskInstances.scheduledAt, start),
				lt(taskInstances.scheduledAt, end)
			)
		)
		.all();

	// One-off blocks carry their own status rather than generating an instance,
	// so they need a second query. Unifying the two is phase 1 of the product
	// plan; until then, leaving this out is what made them invisible here.
	const excActivities = alias(activities, 'exc_activities');
	const excResolvedActivities = alias(activities, 'exc_resolved_activities');
	const excCategories = alias(categories, 'exc_categories');
	const excActivityCategories = alias(categories, 'exc_activity_categories');

	const exceptionalToday = db
		.select({
			id: exceptionalSlots.id,
			status: exceptionalSlots.status,
			startTime: exceptionalSlots.startTime,
			label: exceptionalSlots.label,
			resolvedActivityName: excResolvedActivities.name,
			slotActivityName: excActivities.name,
			categoryName: sql<
				string | null
			>`coalesce(${excCategories.name}, ${excActivityCategories.name})`.as('exc_category_name'),
			categoryColor: sql<
				string | null
			>`coalesce(${excCategories.color}, ${excActivityCategories.color})`.as('exc_category_color')
		})
		.from(exceptionalSlots)
		.leftJoin(excCategories, eq(exceptionalSlots.categoryId, excCategories.id))
		.leftJoin(excActivities, eq(exceptionalSlots.activityId, excActivities.id))
		.leftJoin(excActivityCategories, eq(excActivities.categoryId, excActivityCategories.id))
		.leftJoin(
			excResolvedActivities,
			eq(exceptionalSlots.resolvedActivityId, excResolvedActivities.id)
		)
		.where(
			and(
				eq(exceptionalSlots.userId, userId),
				eq(exceptionalSlots.date, today),
				eq(exceptionalSlots.active, true)
			)
		)
		.all();

	type TodayRow = (typeof weeklyToday)[number];

	function taskName(row: TodayRow): string {
		return (
			row.label?.trim() ||
			row.resolvedActivityName ||
			row.slotActivityName ||
			row.categoryName ||
			'Untitled'
		);
	}

	const todayTasks = [
		...weeklyToday.map((r) => ({ ...r, kind: 'weekly' as const })),
		...exceptionalToday.map((r) => ({ ...r, kind: 'exceptional' as const }))
	]
		.map((r) => ({
			id: r.id,
			kind: r.kind,
			startTime: r.startTime,
			name: taskName(r),
			status: r.status,
			categoryName: r.categoryName,
			categoryColor: r.categoryColor
		}))
		.sort((a, b) => a.startTime.localeCompare(b.startTime));

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
