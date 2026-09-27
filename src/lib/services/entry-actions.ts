import type { RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { batchEntries } from '$lib/services/diary';

/**
 * Several notes at once, from wherever they are listed.
 *
 * The diary lists entries and a notebook lists its notes; both are rows of the
 * same table and a selection means the same thing on either, so both screens
 * mount this one handler.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const entryHandlers = {
	batch: async ({ request, locals }: Event) => {
		const formData = await request.formData();
		try {
			const count = batchEntries(
				buildCtx(locals.user!.id),
				formData.get('do'),
				formData.getAll('id'),
				{
					add: formData.get('add'),
					remove: formData.get('remove'),
					notebookId: formData.get('notebookId') ?? undefined
				}
			);
			return { success: true, action: 'batchEntries', count };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
