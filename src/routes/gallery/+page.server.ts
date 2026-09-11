import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { createAlbum, deleteAlbum, listAlbums, renameAlbum } from '$lib/server/services/gallery';

/**
 * The gallery opens on albums, because that is how anybody actually keeps
 * pictures. Server-side for now: the pictures' bytes live where the media
 * table does, so the self-contained instance gains this room when it gains
 * media.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { albums: listAlbums(buildCtx(locals.user!.id)) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			createAlbum(buildCtx(locals.user!.id), { name: form.get('heading') });
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	rename: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			renameAlbum(buildCtx(locals.user!.id), Number(form.get('id')), {
				name: form.get('heading')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			deleteAlbum(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
