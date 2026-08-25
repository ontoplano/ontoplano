import type { Actions, PageServerLoad } from './$types';
import { ratingsFromForm } from '$lib/ratings';
import { listActivities, listCategories } from '$lib/server/services/activities';
import { buildCtx } from '$lib/server/services/ctx';
import { pickableNotebooks } from '$lib/server/services/notebooks';
import { toActionFailure } from '$lib/server/services/errors';
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
		activities: listActivities(ctx, { activeOnly: true })
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
