import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { plannerTodos, exceptionalSlots, categories, activities } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { toLocalISOString } from '$lib/server/week-generator';
import { listTodos, nextSortOrder } from '$lib/server/services/todos';
import { ratingsFromForm } from '$lib/ratings';
import { isStatus } from '$lib/task-status';

export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user!.id;

	const todos = listTodos(userId);

	const allCategories = db.select().from(categories).where(eq(categories.userId, userId)).all();
	const allActivities = db
		.select()
		.from(activities)
		.where(and(eq(activities.active, true), eq(activities.userId, userId)))
		.orderBy(activities.name)
		.all();

	return {
		todos,
		categories: allCategories,
		activities: allActivities
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const title = formData.get('title')?.toString()?.trim() ?? '';
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!title) return fail(400, { message: 'Title is required' });

		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const scheduledDate = formData.get('scheduledDate')?.toString()?.trim() || null;
		if (scheduledDate && !scheduledDate.match(/^\d{4}-\d{2}-\d{2}$/))
			return fail(400, { message: 'Invalid date' });

		db.insert(plannerTodos)
			.values({
				userId,
				title,
				notes,
				categoryId,
				scheduledDate,
				sortOrder: nextSortOrder(userId),
				...ratingsFromForm(formData)
			})
			.run();

		return { success: true };
	},

	update: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const title = formData.get('title')?.toString()?.trim() ?? '';
		const notes = formData.get('notes')?.toString()?.trim() ?? '';

		if (!id) return fail(400, { message: 'Missing id' });
		if (!title) return fail(400, { message: 'Title is required' });

		const existing = db
			.select({ id: plannerTodos.id })
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Todo not found' });

		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;

		db.update(plannerTodos)
			.set({
				title,
				notes,
				categoryId,
				...ratingsFromForm(formData),
				updatedAt: toLocalISOString(new Date())
			})
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	},

	setStatus: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const status = formData.get('status')?.toString();

		if (!id) return fail(400, { message: 'Missing id' });
		if (!isStatus(status)) return fail(400, { message: 'Invalid status' });

		db.update(plannerTodos)
			.set({
				status,
				// `completed` is kept in step for anything still reading it, and so
				// existing data stays meaningful either way round.
				completed: status === 'done',
				updatedAt: toLocalISOString(new Date())
			})
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	},

	/**
	 * Pull a todo onto a day, or push it back to the general list.
	 *
	 * This is the whole of "scheduling" a todo: one column changes. Nothing is
	 * copied, so there is no second row to keep in sync and no way for the two
	 * to disagree.
	 */
	schedule: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const date = formData.get('scheduledDate')?.toString()?.trim() || null;

		if (!id) return fail(400, { message: 'Missing id' });
		if (date && !date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });

		const existing = db
			.select({ id: plannerTodos.id })
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.get();
		if (!existing) return fail(404, { message: 'Todo not found' });

		db.update(plannerTodos)
			.set({ scheduledDate: date, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));

		if (!id) return fail(400, { message: 'Missing id' });

		db.delete(plannerTodos)
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	},

	delegate: async ({ request, locals }) => {
		const userId = locals.user!.id;
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const date = formData.get('date')?.toString()?.trim() ?? '';
		const startTime = formData.get('startTime')?.toString()?.trim() ?? '';
		const durationMinutes = Number(formData.get('durationMinutes') || 60);
		const mode = formData.get('mode')?.toString() as 'category' | 'activity';
		const categoryId = formData.get('categoryId') ? Number(formData.get('categoryId')) : null;
		const activityId = formData.get('activityId') ? Number(formData.get('activityId')) : null;

		if (!id) return fail(400, { message: 'Missing todo id' });
		if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) return fail(400, { message: 'Invalid date' });
		if (!startTime.match(/^\d{2}:\d{2}$/)) return fail(400, { message: 'Invalid time' });
		if (!mode) return fail(400, { message: 'Mode is required' });
		if (mode === 'category' && !categoryId) return fail(400, { message: 'Category required' });
		if (mode === 'activity' && !activityId) return fail(400, { message: 'Activity required' });

		const todo = db
			.select()
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.get();
		if (!todo) return fail(404, { message: 'Todo not found' });

		db.insert(exceptionalSlots)
			.values({
				userId,
				date,
				startTime,
				durationMinutes,
				mode,
				categoryId,
				activityId,
				label: todo.title
			})
			.run();

		db.update(plannerTodos)
			.set({ completed: true, updatedAt: toLocalISOString(new Date()) })
			.where(and(eq(plannerTodos.id, id), eq(plannerTodos.userId, userId)))
			.run();

		return { success: true };
	}
};
