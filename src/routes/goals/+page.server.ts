import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { db } from '$lib/server/db';
import { activities, goalAreas, goalLinks, goals } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { listAreas, listGoals, linkableSlots } from '$lib/server/services/goals';
import { isGoalStatus, isHorizon, periodStart } from '$lib/goals';
import { toLocalISOString } from '$lib/server/week-generator';
import { listTodos } from '$lib/server/services/todos';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;
	const includeClosed = event.url.searchParams.get('closed') === '1';

	return {
		areas: listAreas(userId),
		goals: listGoals(userId, { includeClosed }),
		includeClosed,
		slots: linkableSlots(userId),
		todos: listTodos(buildCtx(userId)).filter((t) => t.status !== 'done'),
		activities: db
			.select({ id: activities.id, name: activities.name })
			.from(activities)
			.where(and(eq(activities.userId, userId), eq(activities.active, true)))
			.orderBy(activities.name)
			.all()
	};
};

function ownGoal(userId: string, id: number) {
	return db
		.select({ id: goals.id })
		.from(goals)
		.where(and(eq(goals.id, id), eq(goals.userId, userId)))
		.get();
}

export const actions: Actions = {
	createArea: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const name = formData.get('name')?.toString()?.trim() ?? '';
		const color = formData.get('color')?.toString()?.trim() || '#6b7280';
		if (!name) return fail(400, { message: 'Name is required' });

		const existing = db
			.select({ id: goalAreas.id })
			.from(goalAreas)
			.where(and(eq(goalAreas.userId, userId), eq(goalAreas.name, name)))
			.get();
		if (existing) return fail(400, { message: 'You already have an area with that name' });

		db.insert(goalAreas).values({ userId, name, color }).run();
		return { success: true };
	},

	deleteArea: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing id' });

		// Goals keep existing without an area rather than disappearing with it.
		db.delete(goalAreas)
			.where(and(eq(goalAreas.id, id), eq(goalAreas.userId, userId)))
			.run();
		return { success: true };
	},

	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const title = formData.get('title')?.toString()?.trim() ?? '';
		const horizon = formData.get('horizon')?.toString();
		if (!title) return fail(400, { message: 'Title is required' });
		if (!isHorizon(horizon)) return fail(400, { message: 'Pick a horizon' });

		const anchorRaw = formData.get('periodAnchor')?.toString()?.trim();
		const anchor =
			anchorRaw && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw)
				? new Date(anchorRaw + 'T00:00:00')
				: new Date();

		const targetRaw = formData.get('targetValue')?.toString()?.trim();
		const targetValue = targetRaw ? Number(targetRaw) : null;
		if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue <= 0))
			return fail(400, { message: 'Target must be a positive number' });

		const areaId = formData.get('areaId') ? Number(formData.get('areaId')) : null;
		const parentId = formData.get('parentId') ? Number(formData.get('parentId')) : null;
		if (parentId && !ownGoal(userId, parentId))
			return fail(400, { message: 'Unknown parent goal' });

		db.insert(goals)
			.values({
				userId,
				title,
				notes: formData.get('notes')?.toString()?.trim() ?? '',
				horizon,
				// Anchored to the period containing the chosen date, so two goals in
				// the same quarter always agree on where that quarter starts.
				periodStart: periodStart(horizon, anchor),
				areaId,
				parentId,
				targetValue,
				unit: formData.get('unit')?.toString()?.trim() ?? ''
			})
			.run();

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const title = formData.get('title')?.toString()?.trim() ?? '';
		if (!id) return fail(400, { message: 'Missing id' });
		if (!title) return fail(400, { message: 'Title is required' });
		if (!ownGoal(userId, id)) return fail(404, { message: 'Goal not found' });

		const targetRaw = formData.get('targetValue')?.toString()?.trim();
		const targetValue = targetRaw ? Number(targetRaw) : null;
		if (targetValue !== null && (!Number.isFinite(targetValue) || targetValue <= 0))
			return fail(400, { message: 'Target must be a positive number' });

		db.update(goals)
			.set({
				title,
				notes: formData.get('notes')?.toString()?.trim() ?? '',
				areaId: formData.get('areaId') ? Number(formData.get('areaId')) : null,
				targetValue,
				unit: formData.get('unit')?.toString()?.trim() ?? '',
				updatedAt: toLocalISOString(new Date())
			})
			.where(and(eq(goals.id, id), eq(goals.userId, userId)))
			.run();

		return { success: true };
	},

	/** Self-reported progress, for goals with a target and no linked tasks. */
	setProgress: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const value = Number(formData.get('currentValue'));
		if (!id) return fail(400, { message: 'Missing id' });
		if (!Number.isFinite(value) || value < 0)
			return fail(400, { message: 'Progress must be zero or more' });
		if (!ownGoal(userId, id)) return fail(404, { message: 'Goal not found' });

		db.update(goals)
			.set({ currentValue: value, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(goals.id, id), eq(goals.userId, userId)))
			.run();

		return { success: true };
	},

	close: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const status = formData.get('status')?.toString();
		if (!id) return fail(400, { message: 'Missing id' });
		if (!isGoalStatus(status)) return fail(400, { message: 'Invalid status' });
		if (!ownGoal(userId, id)) return fail(404, { message: 'Goal not found' });

		db.update(goals)
			.set({
				status,
				outcome: formData.get('outcome')?.toString()?.trim() ?? '',
				// Reopening clears the closing date, so a reopened goal does not read
				// as having been finished at some point in the past.
				closedAt: status === 'open' ? null : toLocalISOString(new Date()),
				updatedAt: toLocalISOString(new Date())
			})
			.where(and(eq(goals.id, id), eq(goals.userId, userId)))
			.run();

		return { success: true };
	},

	/** Replace a goal's links wholesale — simpler than diffing, and idempotent. */
	setLinks: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing id' });
		if (!ownGoal(userId, id)) return fail(404, { message: 'Goal not found' });

		const slotIds = formData.getAll('slotId').map(Number).filter(Number.isFinite);
		const todoIds = formData.getAll('todoId').map(Number).filter(Number.isFinite);
		const activityIds = formData.getAll('activityId').map(Number).filter(Number.isFinite);

		db.transaction((tx) => {
			tx.delete(goalLinks).where(eq(goalLinks.goalId, id)).run();
			for (const slotId of slotIds) tx.insert(goalLinks).values({ goalId: id, slotId }).run();
			for (const todoId of todoIds) tx.insert(goalLinks).values({ goalId: id, todoId }).run();
			for (const activityId of activityIds)
				tx.insert(goalLinks).values({ goalId: id, activityId }).run();
		});

		return { success: true };
	},

	remove: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		if (!id) return fail(400, { message: 'Missing id' });

		db.transaction((tx) => {
			// Children outlive their parent rather than cascading away; losing a
			// year goal should not silently delete a quarter's worth of work.
			tx.update(goals).set({ parentId: null }).where(eq(goals.parentId, id)).run();
			tx.delete(goals)
				.where(and(eq(goals.id, id), eq(goals.userId, userId)))
				.run();
		});

		return { success: true };
	}
};
