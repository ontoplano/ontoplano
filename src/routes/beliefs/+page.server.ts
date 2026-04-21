import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	beliefs,
	beliefRelations,
	beliefIntensities,
	beliefHabits,
	beliefEvidence,
	beliefTags,
	evidence,
	habits,
	tags,
	graphViews
} from '$lib/server/db/schema';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';
import { parseTags, ensureTagIds, cleanupOrphanTags } from '$lib/server/tags';

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getBeliefForUser(beliefId: number, userId: string): { id: number } | undefined {
	return db
		.select({ id: beliefs.id })
		.from(beliefs)
		.where(and(eq(beliefs.id, beliefId), eq(beliefs.userId, userId)))
		.get();
}

export const load: PageServerLoad = async (event) => {
	const { url } = event;
	const userId = event.locals.user!.id;
	const view = url.searchParams.get('view') ?? 'graph';

	const allBeliefs = db
		.select({
			id: beliefs.id,
			content: beliefs.content,
			valence: beliefs.valence,
			createdAt: beliefs.createdAt,
			updatedAt: beliefs.updatedAt
		})
		.from(beliefs)
		.where(eq(beliefs.userId, userId))
		.orderBy(desc(beliefs.createdAt))
		.all();

	const beliefIds = allBeliefs.map((belief) => belief.id);

	const beliefsWithRelations = allBeliefs.map((belief) => {
		const outgoing = db
			.select({
				id: beliefRelations.id,
				targetBeliefId: beliefRelations.targetBeliefId,
				type: beliefRelations.type,
				createdAt: beliefRelations.createdAt
			})
			.from(beliefRelations)
			.where(
				and(
					eq(beliefRelations.sourceBeliefId, belief.id),
					inArray(beliefRelations.targetBeliefId, beliefIds)
				)
			)
			.all();

		const incoming = db
			.select({
				id: beliefRelations.id,
				sourceBeliefId: beliefRelations.sourceBeliefId,
				type: beliefRelations.type,
				createdAt: beliefRelations.createdAt
			})
			.from(beliefRelations)
			.where(
				and(
					eq(beliefRelations.targetBeliefId, belief.id),
					inArray(beliefRelations.sourceBeliefId, beliefIds)
				)
			)
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
			.where(and(eq(beliefEvidence.beliefId, belief.id), eq(evidence.userId, userId)))
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
			.where(and(eq(beliefHabits.beliefId, belief.id), eq(habits.userId, userId)))
			.all();

		const beliefTagRows = db
			.select({ linkId: beliefTags.id, tagId: tags.id, tagName: tags.name })
			.from(beliefTags)
			.innerJoin(tags, eq(beliefTags.tagId, tags.id))
			.where(and(eq(beliefTags.beliefId, belief.id), eq(tags.userId, userId)))
			.all();

		return {
			...belief,
			relatedBeliefs,
			linkedEvidence,
			intensities,
			linkedHabits,
			tags: beliefTagRows
		};
	});

	const allHabits = db
		.select({ id: habits.id, name: habits.name, type: habits.type })
		.from(habits)
		.where(eq(habits.userId, userId))
		.orderBy(habits.name)
		.all();

	const allEvidence = db
		.select({ id: evidence.id, content: evidence.content, createdAt: evidence.createdAt })
		.from(evidence)
		.where(eq(evidence.userId, userId))
		.orderBy(desc(evidence.createdAt))
		.all();

	const allTags = db
		.select({ id: tags.id, name: tags.name })
		.from(tags)
		.where(eq(tags.userId, userId))
		.orderBy(tags.name)
		.all();

	const allRelations = db
		.select({
			id: beliefRelations.id,
			sourceBeliefId: beliefRelations.sourceBeliefId,
			targetBeliefId: beliefRelations.targetBeliefId,
			type: beliefRelations.type,
			notes: beliefRelations.notes
		})
		.from(beliefRelations)
		.where(
			beliefIds.length > 0
				? or(
						inArray(beliefRelations.sourceBeliefId, beliefIds),
						inArray(beliefRelations.targetBeliefId, beliefIds)
					)
				: eq(beliefRelations.id, -1)
		)
		.all();

	const allBeliefEvidence = db
		.select({
			id: beliefEvidence.id,
			beliefId: beliefEvidence.beliefId,
			evidenceId: beliefEvidence.evidenceId,
			type: beliefEvidence.type
		})
		.from(beliefEvidence)
		.where(
			beliefIds.length > 0 ? inArray(beliefEvidence.beliefId, beliefIds) : eq(beliefEvidence.id, -1)
		)
		.all();

	const today = todayStr();
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
	const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

	const beliefsWithFlags = beliefsWithRelations.map((b) => ({
		...b,
		isNew: b.createdAt >= sevenDaysAgoStr,
		isOrphan: b.relatedBeliefs.length === 0 && b.linkedEvidence.length === 0
	}));

	const savedViews = db
		.select({
			id: graphViews.id,
			name: graphViews.name,
			data: graphViews.data,
			createdAt: graphViews.createdAt
		})
		.from(graphViews)
		.where(eq(graphViews.userId, userId))
		.orderBy(graphViews.name)
		.all();

	return {
		beliefs: beliefsWithFlags,
		allHabits,
		allEvidence,
		allTags,
		allRelations,
		allBeliefEvidence,
		today,
		view,
		savedViews
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const valenceRaw = formData.get('valence')?.toString()?.trim() || null;
		const valence = valenceRaw === 'positive' || valenceRaw === 'negative' ? valenceRaw : null;
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!content) return fail(400, { message: 'Belief content is required' });

		const result = db.insert(beliefs).values({ userId, content, valence }).run();
		const beliefId = Number(result.lastInsertRowid);

		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames, userId);
			for (const tagId of tagIds) {
				db.insert(beliefTags).values({ beliefId, tagId }).run();
			}
		}

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();
		const valenceRaw = formData.get('valence')?.toString()?.trim() || null;
		const valence = valenceRaw === 'positive' || valenceRaw === 'negative' ? valenceRaw : null;
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!id || !content) return fail(400, { message: 'Missing fields' });
		const belief = getBeliefForUser(id, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });

		db.update(beliefs)
			.set({ content, valence, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(beliefs.id, id), eq(beliefs.userId, userId)))
			.run();

		db.delete(beliefTags).where(eq(beliefTags.beliefId, id)).run();
		const tagNames = parseTags(rawTags);
		if (tagNames.length > 0) {
			const tagIds = ensureTagIds(tagNames, userId);
			for (const tagId of tagIds) {
				db.insert(beliefTags).values({ beliefId: id, tagId }).run();
			}
		}

		cleanupOrphanTags(userId);

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const belief = getBeliefForUser(id, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });

		db.delete(beliefs)
			.where(and(eq(beliefs.id, id), eq(beliefs.userId, userId)))
			.run();

		cleanupOrphanTags(userId);

		return { success: true };
	},

	addRelation: async ({ request, locals }) => {
		const userId = locals.user!.id;
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
		const beliefMatches = db
			.select({ id: beliefs.id })
			.from(beliefs)
			.where(and(eq(beliefs.userId, userId), inArray(beliefs.id, [sourceBeliefId, targetBeliefId])))
			.all();
		if (beliefMatches.length < 2) return fail(404, { message: 'Belief not found' });

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

	removeRelation: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const relation = db
			.select({ id: beliefRelations.id })
			.from(beliefRelations)
			.innerJoin(beliefs, eq(beliefRelations.sourceBeliefId, beliefs.id))
			.where(and(eq(beliefRelations.id, id), eq(beliefs.userId, userId)))
			.get();
		if (!relation) return fail(404, { message: 'Relation not found' });

		db.delete(beliefRelations).where(eq(beliefRelations.id, id)).run();

		return { success: true };
	},

	updateRelationNotes: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		const relation = db
			.select({ id: beliefRelations.id })
			.from(beliefRelations)
			.innerJoin(beliefs, eq(beliefRelations.sourceBeliefId, beliefs.id))
			.where(and(eq(beliefRelations.id, id), eq(beliefs.userId, userId)))
			.get();
		if (!relation) return fail(404, { message: 'Relation not found' });

		db.update(beliefRelations).set({ notes }).where(eq(beliefRelations.id, id)).run();

		return { success: true };
	},

	createEvidence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const content = formData.get('content')?.toString()?.trim();
		const beliefId = Number(formData.get('beliefId'));
		const type = formData.get('type')?.toString() as 'supports' | 'contradicts';

		if (!content) return fail(400, { message: 'Evidence content is required' });

		const result = db.insert(evidence).values({ userId, content }).run();
		const evidenceId = Number(result.lastInsertRowid);

		if (beliefId && type && (type === 'supports' || type === 'contradicts')) {
			const belief = getBeliefForUser(beliefId, userId);
			if (!belief) return fail(404, { message: 'Belief not found' });
			db.insert(beliefEvidence).values({ beliefId, evidenceId, type }).run();
		}

		return { success: true };
	},

	linkEvidence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const evidenceId = Number(formData.get('evidenceId'));
		const type = formData.get('type')?.toString() as 'supports' | 'contradicts';

		if (!beliefId || !evidenceId || !type) return fail(400, { message: 'Missing fields' });
		if (type !== 'supports' && type !== 'contradicts')
			return fail(400, { message: 'Type must be supports or contradicts' });
		const belief = getBeliefForUser(beliefId, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });
		const evidenceRow = db
			.select({ id: evidence.id })
			.from(evidence)
			.where(and(eq(evidence.id, evidenceId), eq(evidence.userId, userId)))
			.get();
		if (!evidenceRow) return fail(404, { message: 'Evidence not found' });

		const existing = db
			.select({ id: beliefEvidence.id })
			.from(beliefEvidence)
			.where(and(eq(beliefEvidence.beliefId, beliefId), eq(beliefEvidence.evidenceId, evidenceId)))
			.get();

		if (existing) return fail(400, { message: 'Evidence already linked' });

		db.insert(beliefEvidence).values({ beliefId, evidenceId, type }).run();

		return { success: true };
	},

	unlinkEvidence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const link = db
			.select({ id: beliefEvidence.id })
			.from(beliefEvidence)
			.innerJoin(beliefs, eq(beliefEvidence.beliefId, beliefs.id))
			.where(and(eq(beliefEvidence.id, id), eq(beliefs.userId, userId)))
			.get();
		if (!link) return fail(404, { message: 'Evidence link not found' });

		db.delete(beliefEvidence).where(eq(beliefEvidence.id, id)).run();

		return { success: true };
	},

	deleteEvidence: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const evidenceRow = db
			.select({ id: evidence.id })
			.from(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.userId, userId)))
			.get();
		if (!evidenceRow) return fail(404, { message: 'Evidence not found' });

		db.delete(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.userId, userId)))
			.run();

		return { success: true };
	},

	logIntensity: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const value = Number(formData.get('value'));
		const notes = formData.get('notes')?.toString()?.trim() ?? '';
		const date = formData.get('date')?.toString()?.trim() || todayStr();

		if (!beliefId) return fail(400, { message: 'Missing belief id' });
		if (!value || value < 1 || value > 10) return fail(400, { message: 'Value must be 1-10' });
		const belief = getBeliefForUser(beliefId, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });

		db.insert(beliefIntensities).values({ beliefId, date, value, notes }).run();

		return { success: true };
	},

	linkHabit: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const habitId = Number(formData.get('habitId'));

		if (!beliefId || !habitId) return fail(400, { message: 'Missing fields' });
		const belief = getBeliefForUser(beliefId, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });
		const habit = db
			.select({ id: habits.id })
			.from(habits)
			.where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
			.get();
		if (!habit) return fail(404, { message: 'Habit not found' });

		const existing = db
			.select({ id: beliefHabits.id })
			.from(beliefHabits)
			.where(and(eq(beliefHabits.beliefId, beliefId), eq(beliefHabits.habitId, habitId)))
			.get();

		if (existing) return fail(400, { message: 'Habit already linked' });

		db.insert(beliefHabits).values({ beliefId, habitId }).run();

		return { success: true };
	},

	unlinkHabit: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const link = db
			.select({ id: beliefHabits.id })
			.from(beliefHabits)
			.innerJoin(beliefs, eq(beliefHabits.beliefId, beliefs.id))
			.where(and(eq(beliefHabits.id, id), eq(beliefs.userId, userId)))
			.get();
		if (!link) return fail(404, { message: 'Habit link not found' });

		db.delete(beliefHabits).where(eq(beliefHabits.id, id)).run();

		return { success: true };
	},

	updateBelief: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const content = formData.get('content')?.toString()?.trim();
		const valenceRaw = formData.get('valence')?.toString()?.trim();
		const valence = valenceRaw === 'positive' || valenceRaw === 'negative' ? valenceRaw : null;

		if (!id || !content) return fail(400, { message: 'Missing fields' });
		const belief = getBeliefForUser(id, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });

		db.update(beliefs)
			.set({ content, valence, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(beliefs.id, id), eq(beliefs.userId, userId)))
			.run();

		return { success: true };
	},

	addBeliefTag: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const beliefId = Number(formData.get('beliefId'));
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		if (!beliefId) return fail(400, { message: 'Missing belief id' });
		const belief = getBeliefForUser(beliefId, userId);
		if (!belief) return fail(404, { message: 'Belief not found' });

		const tagNames = parseTags(rawTags);
		if (tagNames.length === 0) return fail(400, { message: 'No tags provided' });

		const tagIds = ensureTagIds(tagNames, userId);
		for (const tagId of tagIds) {
			const existing = db
				.select({ id: beliefTags.id })
				.from(beliefTags)
				.where(and(eq(beliefTags.beliefId, beliefId), eq(beliefTags.tagId, tagId)))
				.get();
			if (!existing) {
				db.insert(beliefTags).values({ beliefId, tagId }).run();
			}
		}

		return { success: true };
	},

	removeBeliefTag: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });
		const link = db
			.select({ id: beliefTags.id })
			.from(beliefTags)
			.innerJoin(beliefs, eq(beliefTags.beliefId, beliefs.id))
			.where(and(eq(beliefTags.id, id), eq(beliefs.userId, userId)))
			.get();
		if (!link) return fail(404, { message: 'Belief tag not found' });

		db.delete(beliefTags).where(eq(beliefTags.id, id)).run();

		cleanupOrphanTags(userId);

		return { success: true };
	},

	bulkAddBeliefTag: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const rawIds = formData.get('beliefIds')?.toString()?.trim() ?? '';
		const rawTags = formData.get('tags')?.toString()?.trim() ?? '';

		const beliefIds = rawIds
			.split(',')
			.map((s) => Number(s.trim()))
			.filter((n) => !isNaN(n) && n > 0);

		if (beliefIds.length === 0) return fail(400, { message: 'No belief IDs provided' });

		const tagNames = parseTags(rawTags);
		if (tagNames.length === 0) return fail(400, { message: 'No tags provided' });

		const ownedBeliefs = db
			.select({ id: beliefs.id })
			.from(beliefs)
			.where(and(inArray(beliefs.id, beliefIds), eq(beliefs.userId, userId)))
			.all();
		const ownedIds = new Set(ownedBeliefs.map((b) => b.id));

		if (ownedIds.size === 0) return fail(404, { message: 'No matching beliefs found' });

		const tagIds = ensureTagIds(tagNames, userId);

		for (const beliefId of ownedIds) {
			for (const tagId of tagIds) {
				const existing = db
					.select({ id: beliefTags.id })
					.from(beliefTags)
					.where(and(eq(beliefTags.beliefId, beliefId), eq(beliefTags.tagId, tagId)))
					.get();
				if (!existing) {
					db.insert(beliefTags).values({ beliefId, tagId }).run();
				}
			}
		}

		return { success: true };
	},

	saveView: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim();
		const data = formData.get('data')?.toString();

		if (!name) return fail(400, { message: 'View name is required' });
		if (!data) return fail(400, { message: 'View data is required' });

		db.insert(graphViews).values({ userId, name, data }).run();
		return { success: true };
	},

	updateView: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const data = formData.get('data')?.toString();

		if (!id || !data) return fail(400, { message: 'Missing fields' });

		const existing = db
			.select({ id: graphViews.id })
			.from(graphViews)
			.where(and(eq(graphViews.id, id), eq(graphViews.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'View not found' });

		db.update(graphViews)
			.set({ data, updatedAt: toLocalISOString(new Date()) })
			.where(eq(graphViews.id, id))
			.run();
		return { success: true };
	},

	renameView: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const name = formData.get('name')?.toString()?.trim();

		if (!id || !name) return fail(400, { message: 'Missing fields' });

		const existing = db
			.select({ id: graphViews.id })
			.from(graphViews)
			.where(and(eq(graphViews.id, id), eq(graphViews.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'View not found' });

		db.update(graphViews)
			.set({ name, updatedAt: toLocalISOString(new Date()) })
			.where(eq(graphViews.id, id))
			.run();
		return { success: true };
	},

	deleteView: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		const existing = db
			.select({ id: graphViews.id })
			.from(graphViews)
			.where(and(eq(graphViews.id, id), eq(graphViews.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'View not found' });

		db.delete(graphViews).where(eq(graphViews.id, id)).run();
		return { success: true };
	}
};
