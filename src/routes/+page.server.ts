import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	diaryEntries,
	tags,
	diaryEntryTags,
	beliefs,
	taskInstances,
	habits,
	habitOccurrences,
	shoppingItems
} from '$lib/server/db/schema';
import { eq, and, gte, lt, desc } from 'drizzle-orm';
import { generateCurrentWeek, toLocalISOString } from '$lib/server/week-generator';

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

	const todayTasks = db
		.select({
			status: taskInstances.status
		})
		.from(taskInstances)
		.where(
			and(
				eq(taskInstances.userId, userId),
				gte(taskInstances.scheduledAt, start),
				lt(taskInstances.scheduledAt, end)
			)
		)
		.all();

	const taskSummary = {
		total: todayTasks.length,
		completed: todayTasks.filter((t) => t.status === 'completed').length,
		delayed: todayTasks.filter((t) => t.status === 'delayed').length,
		early: todayTasks.filter((t) => t.status === 'early').length,
		skipped: todayTasks.filter((t) => t.status === 'skipped').length,
		pending: todayTasks.filter((t) => t.status === 'pending').length
	};

	const today = todayStr();
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

	const recentBeliefs = db
		.select({ id: beliefs.id, content: beliefs.content, valence: beliefs.valence })
		.from(beliefs)
		.where(eq(beliefs.userId, userId))
		.orderBy(desc(beliefs.createdAt))
		.limit(3)
		.all();

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

	return {
		lastEntry: lastEntry ? { ...lastEntry, tags: lastEntryTags } : null,
		allTags,
		taskSummary,
		habitStreaks,
		recentBeliefs,
		shoppingToBuy,
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

		const result = db.insert(diaryEntries).values({ userId, content }).run();
		const entryId = Number(result.lastInsertRowid);

		if (tagsStr) {
			const tagNames = tagsStr
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			for (const name of tagNames) {
				let tag = db
					.select({ id: tags.id })
					.from(tags)
					.where(and(eq(tags.name, name), eq(tags.userId, userId)))
					.get();
				if (!tag) {
					const tagResult = db.insert(tags).values({ userId, name }).run();
					tag = { id: Number(tagResult.lastInsertRowid) };
				}
				db.insert(diaryEntryTags).values({ entryId, tagId: tag.id }).run();
			}
		}

		return { success: true };
	},

	createBelief: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const valence = formData.get('valence')?.toString() || null;

		if (!content) return fail(400, { message: 'Content is required' });

		db.insert(beliefs)
			.values({
				userId,
				content,
				valence: valence as 'positive' | 'negative' | null
			})
			.run();

		return { success: true };
	}
};
