import type { Actions } from '@sveltejs/kit';
import { formAction } from '$lib/services/scoped-actions';
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
export const ideaHandlers = {
	create: formAction((ctx, formData) => {
		const made = createIdea(ctx, {
			content: formData.get('content'),
			tags: formData.get('tags'),
			// `has` rather than `get`: the room's form says nothing about a
			// notebook and must not be read as taking the idea out of one.
			...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
		});
		// The id comes back so a receipt can offer a way straight into it —
		// the same reason a todo's does. See `$lib/open-from-url`.
		return { success: true, id: made };
	}),

	update: formAction((ctx, formData) => {
		updateIdea(ctx, Number(formData.get('id')), {
			content: formData.get('content'),
			tags: formData.get('tags'),
			...(formData.has('notebookId') ? { notebookId: formData.get('notebookId') } : {})
		});
	}),

	delete: formAction((ctx, formData) => {
		deleteIdea(ctx, Number(formData.get('id')));
	}),

	toggleApplied: formAction((ctx, formData) => {
		toggleApplied(ctx, Number(formData.get('id')), formData.get('appliedNote'));
	}),

	updateAppliedNote: formAction((ctx, formData) => {
		updateAppliedNote(ctx, Number(formData.get('id')), formData.get('appliedNote'));
	}),

	toggleFavorite: formAction((ctx, formData) => {
		toggleFavorite(ctx, Number(formData.get('id')));
	})
} satisfies Actions;
