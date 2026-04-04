import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { badHabits, badHabitOccurrences } from '$lib/server/db/schema';
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

export const load: PageServerLoad = async () => {
	const habits = db
		.select({
			id: badHabits.id,
			name: badHabits.name,
			description: badHabits.description,
			createdAt: badHabits.createdAt
		})
		.from(badHabits)
		.orderBy(badHabits.name)
		.all();

	const cutoff = daysAgoStr(365);
	const occurrences = db
		.select({
			id: badHabitOccurrences.id,
			habitId: badHabitOccurrences.habitId,
			date: badHabitOccurrences.date,
			notes: badHabitOccurrences.notes
		})
		.from(badHabitOccurrences)
		.where(gte(badHabitOccurrences.date, cutoff))
		.orderBy(desc(badHabitOccurrences.date))
		.all();

	const today = todayStr();

	return { habits, occurrences, today };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const description = formData.get('description')?.toString()?.trim() ?? '';

		if (!name) return fail(400, { message: 'Name is required' });

		db.insert(badHabits).values({ name, description }).run();

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(badHabits).where(eq(badHabits.id, id)).run();

		return { success: true };
	},

	logOccurrence: async ({ request }) => {
		const formData = await request.formData();
		const habitId = Number(formData.get('habitId'));
		const date = formData.get('date')?.toString()?.trim() || todayStr();
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!habitId) return fail(400, { message: 'Missing habit id' });

		const existing = db
			.select({ id: badHabitOccurrences.id })
			.from(badHabitOccurrences)
			.where(and(eq(badHabitOccurrences.habitId, habitId), eq(badHabitOccurrences.date, date)))
			.get();

		if (existing) {
			return fail(400, { message: 'Already logged for this date' });
		}

		db.insert(badHabitOccurrences).values({ habitId, date, notes }).run();

		return { success: true };
	},

	deleteOccurrence: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(badHabitOccurrences).where(eq(badHabitOccurrences.id, id)).run();

		return { success: true };
	}
};
