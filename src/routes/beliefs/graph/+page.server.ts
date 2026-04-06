import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { beliefs, beliefRelations, evidence, beliefEvidence } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const allBeliefs = db
		.select({
			id: beliefs.id,
			content: beliefs.content
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
