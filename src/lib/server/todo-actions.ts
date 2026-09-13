import { ratingsFromForm } from '$lib/ratings';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	archiveTodo,
	createTodo,
	delegateTodo,
	deleteTodo,
	scheduleTodo,
	setTodoStatus,
	updateTodo
} from '$lib/services/todos';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Everything that can be done to a todo, wherever the row is on screen.
 *
 * The to-do room shows every todo; a notebook shows the ones filed under it,
 * and operating on one there has to mean the same thing — tick it off, put it
 * on a day, edit it, put it away, delete it. The handlers live here so the two
 * screens run the same code rather than two copies that drift.
 *
 * They are mounted under different names on the two routes: a notebook page
 * already has a `delete` and an `update` of its own, so there they are
 * `todoDelete` and `todoUpdate`. `TODO_ACTIONS` below names them for the
 * markup, so a form never spells an action out.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const todoHandlers = {
	create: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			createTodo(buildCtx(locals.user!.id), {
				title: formData.get('heading'),
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

	update: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			updateTodo(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('heading'),
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

	/** Put one away, or take it back out. Neither done nor gone. */
	archive: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			archiveTodo(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('away') !== 'false'
			);
			return { success: true, action: 'archive' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setStatus: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			setTodoStatus(buildCtx(locals.user!.id), Number(formData.get('id')), formData.get('status'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	schedule: async ({ request, locals }: Event) => {
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

	remove: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			deleteTodo(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delegate: async ({ request, locals }: Event) => {
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
