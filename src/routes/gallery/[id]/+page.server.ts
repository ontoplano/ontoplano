import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { mediaLimits } from '$lib/server/services/media';
import {
	addToAlbum,
	albumPictures,
	albumTree,
	listAlbums,
	moveBetweenAlbums,
	removeFromAlbum,
	renamePicture,
	tagPicture,
	uploadToAlbum
} from '$lib/server/services/gallery';

export const load: PageServerLoad = async ({ locals, params }) => {
	const ctx = buildCtx(locals.user!.id);
	const albums = listAlbums(ctx);
	const album = albums.find((a) => a.id === Number(params.id));
	if (!album) error(404, 'No album here.');
	return {
		album,
		albums,
		tree: albumTree(ctx),
		pictures: albumPictures(ctx, album.id),
		pictureKilobytes: mediaLimits().maxKilobytes
	};
};

export const actions: Actions = {
	upload: async ({ request, locals, params }) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			// Several files in one gesture: the picker allows it, so the action does.
			const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
			if (files.length === 0) return fail(400, { message: 'Choose a picture first.' });
			for (const file of files) {
				uploadToAlbum(ctx, Number(params.id), {
					bytes: Buffer.from(await file.arrayBuffer()),
					filename: file.name
				});
			}
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	addTo: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			addToAlbum(
				buildCtx(locals.user!.id),
				Number(form.get('albumId')),
				Number(form.get('mediaId'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	move: async ({ request, locals, params }) => {
		const form = await request.formData();
		try {
			moveBetweenAlbums(
				buildCtx(locals.user!.id),
				Number(params.id),
				Number(form.get('albumId')),
				Number(form.get('mediaId'))
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	remove: async ({ request, locals, params }) => {
		const form = await request.formData();
		try {
			removeFromAlbum(buildCtx(locals.user!.id), Number(params.id), Number(form.get('mediaId')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	rename: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			renamePicture(buildCtx(locals.user!.id), Number(form.get('mediaId')), {
				name: form.get('heading')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	tag: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			tagPicture(buildCtx(locals.user!.id), Number(form.get('mediaId')), form.get('tags'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
