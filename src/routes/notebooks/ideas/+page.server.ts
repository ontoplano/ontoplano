import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { ideaHandlers } from '$lib/services/idea-actions';
import { batchIdeas, listIdeas, listTags } from '$lib/services/ideas';
import { pickableNotebooks } from '$lib/services/notebooks';
import { formAction } from '$lib/services/scoped-actions';

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return { ideas: listIdeas(ctx), allTags: listTags(ctx), notebooks: pickableNotebooks(ctx) };
};

/*
 * The room's own names for the room's own handlers.
 *
 * The same handlers answer inside a notebook under a prefix — see
 * `$lib/services/idea-actions`, which is where they live so the two screens
 * cannot mean different things by the same button. Several at once is this
 * room's, where the selection is.
 */
export const actions = {
	...ideaHandlers,
	batch: formAction((ctx, formData) => {
		const count = batchIdeas(ctx, formData.get('do'), formData.getAll('id'), {
			add: formData.get('add'),
			remove: formData.get('remove'),
			notebookId: formData.get('notebookId') ?? undefined
		});
		return { success: true, action: 'batchIdeas', count };
	})
};
