import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createIdea,
	deleteIdea,
	toggleApplied,
	toggleFavorite,
	updateAppliedNote,
	updateIdea
} from '$lib/services/ideas';

/**
 * Everything that can be done to an idea, wherever the row is on screen.
 *
 * The Ideas room shows every idea; a notebook shows the ones filed under it,
 * and marking one applied there has to mean the same thing. The notebook
 * mounts these under a prefix — see `$lib/services/scoped-actions`.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const ideaHandlers = {
	create: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			createIdea(buildCtx(locals.user!.id), {
				content: formData.get('content'),
				tags: formData.get('tags'),
				// `has` rather than `get`: the room's form says nothing about a
				// notebook and must not be read as taking the idea out of one.
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
			updateIdea(buildCtx(locals.user!.id), Number(formData.get('id')), {
				content: formData.get('content'),
				tags: formData.get('tags'),
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
			deleteIdea(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleApplied: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			toggleApplied(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('appliedNote')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateAppliedNote: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			updateAppliedNote(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('appliedNote')
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	toggleFavorite: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			toggleFavorite(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
