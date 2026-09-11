import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	albumTree,
	createAlbum,
	deleteAlbum,
	importFolder,
	listAlbums,
	planFolder,
	renameAlbum
} from '$lib/server/services/gallery';
import { fail } from '@sveltejs/kit';

/**
 * The gallery opens on albums, because that is how anybody actually keeps
 * pictures. Server-side for now: the pictures' bytes live where the media
 * table does, so the self-contained instance gains this room when it gains
 * media.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	return { albums: listAlbums(ctx), tree: albumTree(ctx) };
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

	/*
	 * A whole folder at once, with its subfolders as albums of their own.
	 *
	 * The browser sends each file's path inside the chosen folder — that is
	 * what `webkitdirectory` adds — so the tree survives the trip and nobody
	 * uploads two hundred pictures one at a time.
	 */
	/*
	 * What would happen, before anything happens.
	 *
	 * Names and sizes only — the bytes stay on the device until the person
	 * has seen the list and said go. A folder of two hundred photographs is
	 * exactly where "18 in, 10 refused" after the fact is useless.
	 */
	planFolder: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			const listed = JSON.parse(String(form.get('files') ?? '[]')) as {
				path: string;
				bytes: number;
			}[];
			if (!Array.isArray(listed) || listed.length === 0)
				return fail(400, { message: 'Choose a folder first.' });
			return {
				success: true,
				plan: planFolder(
					buildCtx(locals.user!.id),
					listed.slice(0, 2000).map((f) => ({
						path: String(f.path ?? ''),
						bytes: Number(f.bytes ?? 0)
					})),
					{ under: String(form.get('under') ?? '').trim() || undefined }
				)
			};
		} catch (e) {
			return toActionFailure(e);
		}
	},

	importFolder: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
			const paths = form.getAll('path').map(String);
			if (files.length === 0) return fail(400, { message: 'Choose a folder first.' });

			const result = importFolder(
				buildCtx(locals.user!.id),
				await Promise.all(
					files.map(async (file, i) => ({
						// The relative path when the picker gave one, else the bare name.
						path: paths[i] || file.name,
						filename: file.name,
						bytes: Buffer.from(await file.arrayBuffer())
					}))
				),
				{ under: String(form.get('under') ?? '').trim() || undefined }
			);
			return { success: true, ...result };
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
