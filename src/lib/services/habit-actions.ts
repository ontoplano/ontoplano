import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createHabit,
	deleteHabit,
	deleteOccurrence,
	logOccurrence,
	toggleOccurrence,
	updateHabit,
	updateOccurrence
} from '$lib/services/habits';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Everything that can be done to a habit, wherever the row is on screen.
 *
 * The Health room shows every habit; a notebook shows the ones filed under it,
 * and ticking one there has to mean the same thing. So the handlers live here
 * and both routes mount them — see `$lib/services/scoped-actions` for how the
 * notebook mounts them under a prefix, and `$lib/scoped-actions` for the names
 * the markup posts to.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const habitHandlers = {
	create: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			createHabit(buildCtx(locals.user!.id), {
				name: formData.get('label'),
				description: formData.get('description'),
				type: formData.get('type'),
				scheduledDays: formData.get('scheduledDays'),
				// `has` rather than `get`: the Health room's form says nothing about
				// a notebook and must not be read as taking the habit out of one.
				...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			updateHabit(buildCtx(locals.user!.id), Number(formData.get('id')), {
				name: formData.get('label'),
				description: formData.get('description'),
				type: formData.get('type'),
				scheduledDays: formData.get('scheduledDays'),
				...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			deleteHabit(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	logOccurrence: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			logOccurrence(buildCtx(locals.user!.id), {
				habitId: formData.get('habitId'),
				date: formData.get('date'),
				notes: formData.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Clicking a day in the heatmap: log it, or take it back. */
	toggleOccurrence: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			toggleOccurrence(buildCtx(locals.user!.id), {
				habitId: formData.get('habitId'),
				date: formData.get('date')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateOccurrence: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			updateOccurrence(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('notes')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteOccurrence: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			deleteOccurrence(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
