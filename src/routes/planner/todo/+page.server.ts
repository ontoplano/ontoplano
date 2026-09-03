import type { Actions, PageServerLoad } from './$types';
import { ratingsFromForm } from '$lib/ratings';
import { listActivities, listCategories } from '$lib/server/services/activities';
import { goalBacklinks } from '$lib/server/services/backlinks';
import { buildCtx } from '$lib/server/services/ctx';
import { pickableNotebooks } from '$lib/server/services/notebooks';
import { toActionFailure } from '$lib/server/http-errors';
import {
	createTodo,
	delegateTodo,
	deleteTodo,
	listTodos,
	scheduleTodo,
	setTodoStatus,
	updateTodo
} from '$lib/server/services/todos';

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);

	return {
		todos: listTodos(ctx),
		categories: listCategories(ctx),
		notebooks: pickableNotebooks(ctx),
		activities: listActivities(ctx, { activeOnly: true }),
		goalLinks: goalBacklinks(ctx)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createTodo(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				notes: formData.get('notes'),
				categoryId: formData.get('categoryId'),
				notebookId: formData.get('notebookId'),
				scheduledDate: formData.get('scheduledDate'),
				ratings: ratingsFromForm(formData)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * There is no `remind` here any more.
	 *
	 * A todo has no time on it — that is what makes it a todo — so there is
	 * nothing for a reminder to be *before*. Wanting to be reminded of one is
	 * wanting it to happen at a time: give it a day and a time, which makes it a
	 * block, and the block's editor takes the reminder. See
	 * `services/reminders.ts`.
	 */

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateTodo(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('title'),
				notes: formData.get('notes'),
				categoryId: formData.get('categoryId'),
				notebookId: formData.get('notebookId'),
				ratings: ratingsFromForm(formData)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setStatus: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setTodoStatus(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('status'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	schedule: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			scheduleTodo(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('scheduledDate')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteTodo(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delegate: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			delegateTodo(buildCtx(locals.user!.id), Number(formData.get('id')), {
				date: formData.get('date'),
				startTime: formData.get('startTime'),
				durationMinutes: formData.get('durationMinutes'),
				mode: formData.get('mode'),
				categoryId: formData.get('categoryId'),
				activityId: formData.get('activityId')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
