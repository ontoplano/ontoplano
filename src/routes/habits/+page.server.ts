import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { habits, habitOccurrences } from '$lib/server/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: string, b: string): number {
	const da = new Date(a + 'T00:00:00');
	const db_ = new Date(b + 'T00:00:00');
	return Math.floor((db_.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStreak(
	habit: { type: string; createdAt: string; scheduledDays: string | null },
	occurrences: { date: string }[],
	today: string
): number {
	if (habit.type === 'bad') {
		if (occurrences.length === 0) {
			const created = habit.createdAt.slice(0, 10);
			return daysBetween(created, today);
		}
		const lastSlip = occurrences[0].date;
		return daysBetween(lastSlip, today);
	}

	// Good habit: count consecutive days completed going backwards from today
	const scheduledSet = parseScheduledDays(habit.scheduledDays);
	const completedDates = new Set(occurrences.map((o) => o.date));
	let streak = 0;
	const d = new Date(today + 'T00:00:00');

	for (let i = 0; i < 365; i++) {
		const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const dow = d.getDay();
		const weekday = dow === 0 ? 6 : dow - 1; // JS Sunday=0 → our Mon=0..Sun=6

		if (scheduledSet.length === 0 || scheduledSet.includes(weekday)) {
			if (completedDates.has(dateStr)) {
				streak++;
			} else if (i > 0) {
				break;
			} else {
				// Today not yet completed — don't break streak but don't count it
			}
		}
		d.setDate(d.getDate() - 1);
	}

	return streak;
}

function parseScheduledDays(raw: string | null): number[] {
	if (!raw || raw.trim() === '') return [];
	return raw
		.split(',')
		.map((s) => parseInt(s.trim(), 10))
		.filter((n) => !isNaN(n) && n >= 0 && n <= 6);
}

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const allHabits = db
		.select({
			id: habits.id,
			name: habits.name,
			description: habits.description,
			type: habits.type,
			scheduledDays: habits.scheduledDays,
			createdAt: habits.createdAt
		})
		.from(habits)
		.where(eq(habits.userId, userId))
		.orderBy(habits.name)
		.all();

	const cutoff = daysAgoStr(365);
	const occurrences = db
		.select({
			id: habitOccurrences.id,
			habitId: habitOccurrences.habitId,
			date: habitOccurrences.date,
			notes: habitOccurrences.notes
		})
		.from(habitOccurrences)
		.innerJoin(habits, eq(habitOccurrences.habitId, habits.id))
		.where(and(eq(habits.userId, userId), gte(habitOccurrences.date, cutoff)))
		.orderBy(desc(habitOccurrences.date))
		.all();

	const today = todayStr();

	const habitsWithStreaks = allHabits.map((habit) => {
		const habitOcc = occurrences
			.filter((o) => o.habitId === habit.id)
			.sort((a, b) => (a.date > b.date ? -1 : 1));
		const streak = computeStreak(habit, habitOcc, today);
		return { ...habit, streak };
	});

	return { habits: habitsWithStreaks, occurrences, today };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const description = formData.get('description')?.toString()?.trim() ?? '';
		const type = formData.get('type')?.toString()?.trim() || 'bad';
		const scheduledDays = formData.get('scheduledDays')?.toString()?.trim() ?? '';

		if (!name) return fail(400, { message: 'Name is required' });
		if (type !== 'bad' && type !== 'good') return fail(400, { message: 'Invalid type' });

		db.insert(habits).values({ userId, name, description, type, scheduledDays }).run();

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const existing = db
			.select({ id: habits.id })
			.from(habits)
			.where(and(eq(habits.id, id), eq(habits.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Habit not found' });

		db.delete(habits)
			.where(and(eq(habits.id, id), eq(habits.userId, userId)))
			.run();

		return { success: true };
	},

	logOccurrence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const habitId = Number(formData.get('habitId'));
		const date = formData.get('date')?.toString()?.trim() || todayStr();
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!habitId) return fail(400, { message: 'Missing habit id' });
		const habit = db
			.select({ id: habits.id })
			.from(habits)
			.where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
			.get();
		if (!habit) return fail(404, { message: 'Habit not found' });

		const existing = db
			.select({ id: habitOccurrences.id })
			.from(habitOccurrences)
			.where(and(eq(habitOccurrences.habitId, habitId), eq(habitOccurrences.date, date)))
			.get();

		if (existing) {
			return fail(400, { message: 'Already logged for this date' });
		}

		db.insert(habitOccurrences).values({ habitId, date, notes }).run();

		return { success: true };
	},

	deleteOccurrence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const occurrence = db
			.select({ id: habitOccurrences.id })
			.from(habitOccurrences)
			.innerJoin(habits, eq(habitOccurrences.habitId, habits.id))
			.where(and(eq(habitOccurrences.id, id), eq(habits.userId, userId)))
			.get();
		if (!occurrence) return fail(404, { message: 'Occurrence not found' });

		db.delete(habitOccurrences).where(eq(habitOccurrences.id, id)).run();

		return { success: true };
	},

	toggleOccurrence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const habitId = Number(formData.get('habitId'));
		const date = formData.get('date')?.toString()?.trim();

		if (!habitId || !date) return fail(400, { message: 'Missing habitId or date' });

		const habit = db
			.select({ id: habits.id })
			.from(habits)
			.where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
			.get();
		if (!habit) return fail(404, { message: 'Habit not found' });

		const existing = db
			.select({ id: habitOccurrences.id })
			.from(habitOccurrences)
			.where(and(eq(habitOccurrences.habitId, habitId), eq(habitOccurrences.date, date)))
			.get();

		if (existing) {
			db.delete(habitOccurrences).where(eq(habitOccurrences.id, existing.id)).run();
		} else {
			db.insert(habitOccurrences).values({ habitId, date, notes: '' }).run();
		}

		return { success: true };
	}
};
