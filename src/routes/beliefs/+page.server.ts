import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	beliefs,
	beliefReasons,
	beliefContradictions,
	beliefIntensities,
	beliefHabits,
	habits
} from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const load: PageServerLoad = async () => {
	const allBeliefs = db
		.select({
			id: beliefs.id,
			content: beliefs.content,
			createdAt: beliefs.createdAt,
			updatedAt: beliefs.updatedAt
		})
		.from(beliefs)
		.orderBy(desc(beliefs.createdAt))
		.all();

	const beliefsWithRelations = allBeliefs.map((belief) => {
		const reasons = db
			.select({
				id: beliefReasons.id,
				content: beliefReasons.content,
				createdAt: beliefReasons.createdAt
			})
			.from(beliefReasons)
			.where(eq(beliefReasons.beliefId, belief.id))
			.orderBy(beliefReasons.createdAt)
			.all();

		const contradictions = db
			.select({
				id: beliefContradictions.id,
				content: beliefContradictions.content,
				createdAt: beliefContradictions.createdAt
			})
			.from(beliefContradictions)
			.where(eq(beliefContradictions.beliefId, belief.id))
			.orderBy(beliefContradictions.createdAt)
			.all();

		const intensities = db
			.select({
				id: beliefIntensities.id,
				date: beliefIntensities.date,
				value: beliefIntensities.value,
				notes: beliefIntensities.notes
			})
			.from(beliefIntensities)
			.where(eq(beliefIntensities.beliefId, belief.id))
			.orderBy(desc(beliefIntensities.date))
			.all();

		const linkedHabits = db
			.select({
				linkId: beliefHabits.id,
				habitId: habits.id,
				habitName: habits.name,
				habitType: habits.type
			})
			.from(beliefHabits)
			.innerJoin(habits, eq(beliefHabits.habitId, habits.id))
			.where(eq(beliefHabits.beliefId, belief.id))
			.all();

		return { ...belief, reasons, contradictions, intensities, linkedHabits };
	});

	const allHabits = db
		.select({ id: habits.id, name: habits.name, type: habits.type })
		.from(habits)
		.orderBy(habits.name)
		.all();

	return { beliefs: beliefsWithRelations, allHabits, today: todayStr() };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();

		if (!content) return fail(400, { message: 'Belief content is required' });

		db.insert(beliefs).values({ content }).run();

		return { success: true };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();

		if (!id || !content) return fail(400, { message: 'Missing fields' });

		db.update(beliefs)
			.set({ content, updatedAt: toLocalISOString(new Date()) })
			.where(eq(beliefs.id, id))
			.run();

		return { success: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefs).where(eq(beliefs.id, id)).run();

		return { success: true };
	},

	addReason: async ({ request }) => {
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const content = formData.get('content')?.toString()?.trim();

		if (!beliefId || !content) return fail(400, { message: 'Missing fields' });

		db.insert(beliefReasons).values({ beliefId, content }).run();

		return { success: true };
	},

	removeReason: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefReasons).where(eq(beliefReasons.id, id)).run();

		return { success: true };
	},

	addContradiction: async ({ request }) => {
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const content = formData.get('content')?.toString()?.trim();

		if (!beliefId || !content) return fail(400, { message: 'Missing fields' });

		db.insert(beliefContradictions).values({ beliefId, content }).run();

		return { success: true };
	},

	removeContradiction: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefContradictions).where(eq(beliefContradictions.id, id)).run();

		return { success: true };
	},

	logIntensity: async ({ request }) => {
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const value = Number(formData.get('value'));
		const notes = formData.get('notes')?.toString()?.trim() ?? '';
		const date = formData.get('date')?.toString()?.trim() || todayStr();

		if (!beliefId) return fail(400, { message: 'Missing belief id' });
		if (!value || value < 1 || value > 10) return fail(400, { message: 'Value must be 1-10' });

		db.insert(beliefIntensities).values({ beliefId, date, value, notes }).run();

		return { success: true };
	},

	linkHabit: async ({ request }) => {
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const habitId = Number(formData.get('habitId'));

		if (!beliefId || !habitId) return fail(400, { message: 'Missing fields' });

		const existing = db
			.select({ id: beliefHabits.id })
			.from(beliefHabits)
			.where(and(eq(beliefHabits.beliefId, beliefId), eq(beliefHabits.habitId, habitId)))
			.get();

		if (existing) return fail(400, { message: 'Habit already linked' });

		db.insert(beliefHabits).values({ beliefId, habitId }).run();

		return { success: true };
	},

	unlinkHabit: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefHabits).where(eq(beliefHabits.id, id)).run();

		return { success: true };
	}
};
