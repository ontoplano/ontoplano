import { batchEntries } from '$lib/services/diary';
import { formAction } from '$lib/services/scoped-actions';

/**
 * Several notes at once, from wherever they are listed.
 *
 * The diary lists entries and a notebook lists its notes; both are rows of the
 * same table and a selection means the same thing on either, so both screens
 * mount this one handler.
 */
export const entryHandlers = {
	batch: formAction((ctx, formData) => {
		const count = batchEntries(ctx, formData.get('do'), formData.getAll('id'), {
			add: formData.get('add'),
			remove: formData.get('remove'),
			notebookId: formData.get('notebookId') ?? undefined
		});
		return { success: true, action: 'batchEntries', count };
	})
};
