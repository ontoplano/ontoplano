import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { beliefs, beliefRelations, evidence, beliefEvidence } from '$lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const allBeliefs = db
		.select({
			id: beliefs.id,
			content: beliefs.content,
			valence: beliefs.valence
		})
		.from(beliefs)
		.all();

	const allRelations = db
		.select({
			id: beliefRelations.id,
			sourceBeliefId: beliefRelations.sourceBeliefId,
			targetBeliefId: beliefRelations.targetBeliefId,
			type: beliefRelations.type
		})
		.from(beliefRelations)
		.all();

	const allEvidence = db
		.select({
			id: evidence.id,
			content: evidence.content
		})
		.from(evidence)
		.all();

	const allBeliefEvidence = db
		.select({
			id: beliefEvidence.id,
			beliefId: beliefEvidence.beliefId,
			evidenceId: beliefEvidence.evidenceId,
			type: beliefEvidence.type
		})
		.from(beliefEvidence)
		.all();

	return {
		beliefs: allBeliefs,
		relations: allRelations,
		evidence: allEvidence,
		beliefEvidence: allBeliefEvidence
	};
};

export const actions: Actions = {
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
				or(
					and(
						eq(beliefRelations.sourceBeliefId, sourceBeliefId),
						eq(beliefRelations.targetBeliefId, targetBeliefId)
					),
					and(
						eq(beliefRelations.sourceBeliefId, targetBeliefId),
						eq(beliefRelations.targetBeliefId, sourceBeliefId)
					)
				)
			)
			.get();

		if (existing) return fail(400, { message: 'Relation already exists between these beliefs' });

		db.insert(beliefRelations).values({ sourceBeliefId, targetBeliefId, type }).run();

		return { success: true };
	},

	removeRelation: async ({ request }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(beliefRelations).where(eq(beliefRelations.id, id)).run();

		return { success: true };
	}
};
