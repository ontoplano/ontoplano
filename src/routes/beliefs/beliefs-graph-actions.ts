import { invalidateAll } from '$app/navigation';

async function postAction(action: string, params: Record<string, string>): Promise<void> {
	const body = new URLSearchParams(params);
	await fetch(`?/${action}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString()
	});
	await invalidateAll();
}

export async function graphCreateBelief(content: string, valence: string): Promise<void> {
	await postAction('create', { content, valence });
}

export async function graphDeleteBelief(beliefId: number): Promise<void> {
	await postAction('delete', { id: String(beliefId) });
}

export async function graphUpdateBelief(
	beliefId: number,
	content: string,
	valence: string
): Promise<void> {
	await postAction('update', { id: String(beliefId), content, valence });
}

export async function graphAddRelation(
	sourceId: number,
	targetId: number,
	type: string
): Promise<void> {
	await postAction('addRelation', {
		sourceBeliefId: String(sourceId),
		targetBeliefId: String(targetId),
		type
	});
}

export async function graphRemoveRelation(relationId: number): Promise<void> {
	await postAction('removeRelation', { id: String(relationId) });
}

export async function graphUpdateRelationNotes(relationId: number, notes: string): Promise<void> {
	await postAction('updateRelationNotes', { id: String(relationId), notes });
}

export async function graphCreateEvidence(
	beliefId: number,
	content: string,
	type: string
): Promise<void> {
	await postAction('createEvidence', {
		beliefId: String(beliefId),
		content,
		type
	});
}

export async function graphLinkEvidence(
	beliefId: number,
	evidenceId: number,
	type: string
): Promise<void> {
	await postAction('linkEvidence', {
		beliefId: String(beliefId),
		evidenceId: String(evidenceId),
		type
	});
}

export async function graphUnlinkEvidence(linkId: number): Promise<void> {
	await postAction('unlinkEvidence', { id: String(linkId) });
}

export async function graphDeleteEvidence(evidenceId: number): Promise<void> {
	await postAction('deleteEvidence', { id: String(evidenceId) });
}

export async function graphLogIntensity(
	beliefId: number,
	value: number,
	date: string,
	notes: string
): Promise<void> {
	await postAction('logIntensity', {
		beliefId: String(beliefId),
		value: String(value),
		date,
		notes
	});
}

export async function graphLinkHabit(beliefId: number, habitId: number): Promise<void> {
	await postAction('linkHabit', {
		beliefId: String(beliefId),
		habitId: String(habitId)
	});
}

export async function graphUnlinkHabit(linkId: number): Promise<void> {
	await postAction('unlinkHabit', { id: String(linkId) });
}

export async function graphAddTag(beliefId: number, tagName: string): Promise<void> {
	await postAction('addBeliefTag', {
		beliefId: String(beliefId),
		tags: tagName
	});
}

export async function graphRemoveTag(linkId: number): Promise<void> {
	await postAction('removeBeliefTag', { id: String(linkId) });
}

export async function graphBulkAddTags(beliefIds: number[], tags: string): Promise<void> {
	await postAction('bulkAddBeliefTag', {
		beliefIds: beliefIds.join(','),
		tags
	});
}

export async function updateBeliefContent(beliefId: number, content: string): Promise<void> {
	await postAction('updateBelief', { id: String(beliefId), content });
}

// --- Saved views ---

export async function saveView(name: string, viewData: string): Promise<void> {
	await postAction('saveView', { name, data: viewData });
}

export async function updateView(id: number, viewData: string): Promise<void> {
	await postAction('updateView', { id: String(id), data: viewData });
}

export async function renameView(id: number, name: string): Promise<void> {
	await postAction('renameView', { id: String(id), name });
}

export async function deleteView(id: number): Promise<void> {
	await postAction('deleteView', { id: String(id) });
}
