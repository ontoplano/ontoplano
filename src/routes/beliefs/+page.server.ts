import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	beliefs,
	beliefRelations,
	beliefIntensities,
	beliefHabits,
	beliefEvidence,
	evidence,
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
			valence: beliefs.valence,
			createdAt: beliefs.createdAt,
			updatedAt: beliefs.updatedAt
		})
		.from(beliefs)
		.orderBy(desc(beliefs.createdAt))
		.all();

	const beliefsWithRelations = allBeliefs.map((belief) => {
		const outgoing = db
			.select({
				id: beliefRelations.id,
				targetBeliefId: beliefRelations.targetBeliefId,
				type: beliefRelations.type,
				createdAt: beliefRelations.createdAt
			})
			.from(beliefRelations)
			.where(eq(beliefRelations.sourceBeliefId, belief.id))
			.all();

		const incoming = db
			.select({
				id: beliefRelations.id,
				sourceBeliefId: beliefRelations.sourceBeliefId,
				type: beliefRelations.type,
				createdAt: beliefRelations.createdAt
			})
			.from(beliefRelations)
			.where(eq(beliefRelations.targetBeliefId, belief.id))
			.all();

		const relatedBeliefs = [
			...outgoing.map((r) => {
				const target = allBeliefs.find((b) => b.id === r.targetBeliefId);
				return {
					relationId: r.id,
					beliefId: r.targetBeliefId,
					beliefContent: target?.content ?? '',
					type: r.type as 'supports' | 'contradicts',
					direction: 'outgoing' as const
				};
			}),
			...incoming.map((r) => {
				const source = allBeliefs.find((b) => b.id === r.sourceBeliefId);
				return {
					relationId: r.id,
					beliefId: r.sourceBeliefId,
					beliefContent: source?.content ?? '',
					type: r.type as 'supports' | 'contradicts',
					direction: 'incoming' as const
				};
			})
		];

		const linkedEvidence = db
			.select({
				linkId: beliefEvidence.id,
				evidenceId: evidence.id,
				evidenceContent: evidence.content,
				type: beliefEvidence.type,
				createdAt: evidence.createdAt
			})
			.from(beliefEvidence)
			.innerJoin(evidence, eq(beliefEvidence.evidenceId, evidence.id))
			.where(eq(beliefEvidence.beliefId, belief.id))
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

		return { ...belief, relatedBeliefs, linkedEvidence, intensities, linkedHabits };
	});

	const allHabits = db
		.select({ id: habits.id, name: habits.name, type: habits.type })
		.from(habits)
		.orderBy(habits.name)
		.all();

	const allEvidence = db
		.select({ id: evidence.id, content: evidence.content, createdAt: evidence.createdAt })
		.from(evidence)
		.orderBy(desc(evidence.createdAt))
		.all();

	return { beliefs: beliefsWithRelations, allHabits, allEvidence, today: todayStr() };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const valenceRaw = formData.get('valence')?.toString()?.trim() || null;
		const valence = valenceRaw === 'positive' || valenceRaw === 'negative' ? valenceRaw : null;

		if (!content) return fail(400, { message: 'Belief content is required' });

		db.insert(beliefs).values({ content, valence }).run();

		return { success: true };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();
		const valenceRaw = formData.get('valence')?.toString()?.trim() || null;
		const valence = valenceRaw === 'positive' || valenceRaw === 'negative' ? valenceRaw : null;

		if (!id || !content) return fail(400, { message: 'Missing fields' });

		db.update(beliefs)
			.set({ content, valence, updatedAt: toLocalISOString(new Date()) })
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

	addRelation: async ({ request }) => {
		const formData = await request.formData();
		const sourceBeliefId = Number(formData.get('sourceBeliefId'));
		const targetBeliefId = Number(formData.get('targetBeliefId'));
		const type = formData.get('type')?.toString() as 'supports' | 'contradicts';

		if (!sourceBeliefId || !targetBeliefId || !type)
			return fail(400, { message: 'Missing fields' });
		if (sourceBeliefId === targetBeliefId)
			return fail(400, { message: 'Cannot relate a belief to itself' });
		if (type !== 'supports' && type !== 'contradicts')
			return fail(400, { message: 'Type must be supports or contradicts' });

		const existing = db
			.select({ id: beliefRelations.id })
			.from(beliefRelations)
			.where(
				and(
					eq(beliefRelations.sourceBeliefId, sourceBeliefId),
					eq(beliefRelations.targetBeliefId, targetBeliefId)
				)
			)
			.get();

		if (existing) return fail(400, { message: 'This exact relation already exists' });

		db.insert(beliefRelations).values({ sourceBeliefId, targetBeliefId, type }).run();

		return { success: true };
	},

	removeRelation: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefRelations).where(eq(beliefRelations.id, id)).run();

		return { success: true };
	},

	createEvidence: async ({ request }) => {
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const beliefId = Number(formData.get('beliefId'));
		const type = formData.get('type')?.toString() as 'supports' | 'contradicts';

		if (!content) return fail(400, { message: 'Evidence content is required' });

		const result = db.insert(evidence).values({ content }).run();
		const evidenceId = Number(result.lastInsertRowid);

		if (beliefId && type && (type === 'supports' || type === 'contradicts')) {
			db.insert(beliefEvidence).values({ beliefId, evidenceId, type }).run();
		}

		return { success: true };
	},

	linkEvidence: async ({ request }) => {
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const evidenceId = Number(formData.get('evidenceId'));
		const type = formData.get('type')?.toString() as 'supports' | 'contradicts';

		if (!beliefId || !evidenceId || !type) return fail(400, { message: 'Missing fields' });
		if (type !== 'supports' && type !== 'contradicts')
			return fail(400, { message: 'Type must be supports or contradicts' });

		const existing = db
			.select({ id: beliefEvidence.id })
			.from(beliefEvidence)
			.where(and(eq(beliefEvidence.beliefId, beliefId), eq(beliefEvidence.evidenceId, evidenceId)))
			.get();

		if (existing) return fail(400, { message: 'Evidence already linked' });

		db.insert(beliefEvidence).values({ beliefId, evidenceId, type }).run();

		return { success: true };
	},

	unlinkEvidence: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefEvidence).where(eq(beliefEvidence.id, id)).run();

		return { success: true };
	},

	deleteEvidence: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(evidence).where(eq(evidence.id, id)).run();

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
