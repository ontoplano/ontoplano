/*
 * The pictures nothing points at, and the one thing to do about them.
 *
 * Derived, like the notebooks album — see `$lib/services/unused-media`. Runs
 * on the device as well as on a server, like the rest of the gallery.
 */
import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { removeUnused, unusedPictures } from '$lib/services/unused-media';

export const load = async ({ locals }: IsolatedEvent) => ({
	pictures: unusedPictures(buildCtx(locals.user!.id))
});

export const actions = {
	remove: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			const ids = form.getAll('mediaId').map(Number).filter(Number.isInteger);
			removeUnused(buildCtx(locals.user!.id), ids);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
