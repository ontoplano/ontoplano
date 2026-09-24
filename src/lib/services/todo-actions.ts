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
	tagTodo,
	updateTodo
} from '$lib/services/todos';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Everything that can be done to a todo, wherever the row is on screen.
 *
 * In `services` rather than `server`, where it used to be: nothing here needs
 * a server. It is form handlers over the todo service, and the to-do room is
 * one of the rooms a phone-only instance carries — so a file under
 * `$lib/server` was a route compiled into the device's worker importing from a
 * directory that must never reach it. It happened to work because this file
 * touches no Node API; the next thing added to it would not have.
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
			const made = createTodo(buildCtx(locals.user!.id), {
				title: formData.get('heading'),
				notes: formData.get('notes'),
				categoryId: formData.get('categoryId'),
				notebookId: formData.get('notebookId'),
				// `has` rather than `get`: a form with no tags box must leave the
				// labels alone, and one with an empty box must clear them.
				...(formData.has('tags') ? { tags: formData.get('tags') } : {}),
				scheduledDate: formData.get('scheduledDate'),
				ratings: ratingsFromForm(formData)
			});
			/*
			 * The id comes back, so the toast can offer a way straight into the
			 * thing just made. Without it the only route to "say more about
			 * this" is finding the row again in a list that has just reordered.
			 */
			return { success: true, id: made };
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
				...(formData.has('tags') ? { tags: formData.get('tags') } : {}),
				ratings: ratingsFromForm(formData)
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * A label on or off, and nothing else touched.
	 *
	 * `update` replaces the whole row, so putting one word on a task through
	 * it means sending the title, the notes, the notebook and every other
	 * label back unchanged — which is a dialog, not a press, and is wrong for
	 * the one beside the labels themselves. The same pair the MCP tool takes,
	 * over the same service function.
	 */
	tag: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			tagTodo(buildCtx(locals.user!.id), Number(formData.get('id')), {
				add: formData.get('add'),
				remove: formData.get('remove')
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
				activityId: formData.get('activityId'),
				remindLeadMinutes: formData.get('remindLeadMinutes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
