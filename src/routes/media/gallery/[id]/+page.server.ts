/*
 * One album: its pictures, and everything you can do to them. Runs on the
 * device as well as on a server — see the note on the albums index.
 */
import type { IsolatedEvent } from '$lib/isolated/routes';
import { error, fail } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { mediaLimits } from '$lib/services/media';
import { formAction } from '$lib/services/scoped-actions';
import {
	addToAlbum,
	albumPicturesDeep,
	albumTree,
	albumsInside,
	listAlbums,
	moveBetweenAlbums,
	removeFromAlbum,
	renamePicture,
	tagPicture,
	uploadToAlbum
} from '$lib/services/gallery';

export const load = async ({ locals, params }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const albums = listAlbums(ctx);
	const album = albums.find((a) => a.id === Number(params.id));
	if (!album) error(404, 'No album here.');
	return {
		album,
		albums,
		tree: albumTree(ctx),
		// The folders in this one, drawn above the grid — and the grid itself is
		// everything beneath, because a parent whose pictures are all in
		// subfolders was an empty page with a count on it.
		folders: albumsInside(ctx, album.id).direct,
		pictures: albumPicturesDeep(ctx, album.id),
		pictureKilobytes: mediaLimits().maxKilobytes
	};
};

export const actions = {
	upload: async ({ request, locals, params }: IsolatedEvent) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			// Several files in one gesture: the picker allows it, so the action does.
			const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
			if (files.length === 0) return fail(400, { message: 'Choose a picture first.' });
			for (const file of files) {
				await uploadToAlbum(ctx, Number(params.id), {
					bytes: new Uint8Array(await file.arrayBuffer()),
					filename: file.name
				});
			}
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	addTo: formAction((ctx, form) => {
		addToAlbum(ctx, Number(form.get('albumId')), Number(form.get('mediaId')));
	}),

	move: async ({ request, locals, params }: IsolatedEvent) => {
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

	remove: async ({ request, locals, params }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			removeFromAlbum(buildCtx(locals.user!.id), Number(params.id), Number(form.get('mediaId')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	rename: formAction((ctx, form) => {
		renamePicture(ctx, Number(form.get('mediaId')), {
			name: form.get('heading'),
			alt: form.get('alt')
		});
	}),

	tag: formAction((ctx, form) => {
		tagPicture(ctx, Number(form.get('mediaId')), form.get('tags'));
	})
};
