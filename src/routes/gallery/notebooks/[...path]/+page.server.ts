/*
 * The notebooks album: every picture that is in a notebook, as folders.
 *
 * Derived rather than stored — see `$lib/services/notebook-media` for why —
 * which is also why this page has no actions. Nothing is uploaded into a
 * notebook from the gallery and nothing is dragged out of one: a picture is
 * here because a note mentions it, and the way to change that is to edit the
 * note. Runs on the device as well as on a server, like the rest of the
 * gallery.
 */
import type { IsolatedEvent } from '$lib/isolated/routes';
import { error } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { NotFoundError } from '$lib/services/errors';
import { NOTEBOOK_ALBUM_NAME, notebookMediaView } from '$lib/services/notebook-media';
import { NOTEBOOK_SEPARATOR } from '$lib/services/notebooks';

export const load = async ({ locals, params }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * The address is the notebook's own name, one path segment per level.
	 *
	 * `gallery/notebooks/Home/Kitchen` is the notebook `Home — Kitchen`, so a
	 * link can be built from a name and a name read back out of a link without
	 * either side knowing about the separator.
	 */
	const path = (params.path ?? '')
		.split('/')
		.filter(Boolean)
		.map(decodeURIComponent)
		.join(NOTEBOOK_SEPARATOR);

	try {
		const { folders, pictures } = notebookMediaView(ctx, path);
		return {
			path,
			title: path ? path.split(NOTEBOOK_SEPARATOR).at(-1)! : NOTEBOOK_ALBUM_NAME,
			folders,
			pictures
		};
	} catch (e) {
		if (e instanceof NotFoundError) error(404, e.message);
		throw e;
	}
};
