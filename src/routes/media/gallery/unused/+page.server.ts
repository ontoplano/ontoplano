/*
 * The pictures nothing points at, and the one thing to do about them.
 *
 * Derived, like the notebooks album — see `$lib/services/unused-media`. Runs
 * on the device as well as on a server, like the rest of the gallery.
 */
import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { removeUnused, unusedPictures } from '$lib/services/unused-media';
import { formAction } from '$lib/services/scoped-actions';

export const load = async ({ locals }: IsolatedEvent) => ({
	pictures: unusedPictures(buildCtx(locals.user!.id))
});

export const actions = {
	remove: formAction((ctx, form) => {
		const ids = form.getAll('mediaId').map(Number).filter(Number.isInteger);
		removeUnused(ctx, ids);
	})
};
