/*
 * The albums, on whichever instance is running.
 *
 * Nothing here is the server's any more: the pictures are rows in the same
 * database on a phone as on a box, so the gallery is the same two functions
 * either way. The only thing the device does differently is how an `<img>`
 * reaches the bytes — see `$lib/isolated/pictures.ts`.
 */
import type { IsolatedEvent } from '$lib/isolated/routes';
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
} from '$lib/services/gallery';
import { mediaLimits } from '$lib/services/media';
import { notebookMediaCount } from '$lib/services/notebook-media';
import { fail } from '@sveltejs/kit';

/** The gallery opens on albums, because that is how anybody actually keeps pictures. */
export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	return {
		albums: listAlbums(ctx),
		tree: albumTree(ctx),
		// The pictures that are in notebooks, which are not an album anybody
		// made and cannot be one: see `$lib/services/notebook-media`.
		notebookPictures: notebookMediaCount(ctx)
	};
};

export const actions = {
	create: async ({ request, locals }: IsolatedEvent) => {
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
	planFolder: async ({ request, locals }: IsolatedEvent) => {
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
					// One more than the ceiling is enough to say "and more" —
					// a listing of a hundred thousand names is itself a body
					// this has no reason to hold.
					listed.slice(0, mediaLimits().importFiles + 1).map((f) => ({
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

	/*
	 * One batch of the tree, as bytes.
	 *
	 * The browser sends the folder in several requests rather than one: a
	 * hundred photographs in a single POST is a body the Node adapter
	 * refuses before this app runs, with a plain 413 no page can read. Each
	 * file is read in turn rather than all at once, so the memory this holds
	 * is one picture and not the batch.
	 */
	importFolder: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			const limits = mediaLimits();
			const files = form
				.getAll('file')
				.filter((f): f is File => f instanceof File && f.size > 0)
				.slice(0, limits.importFiles);
			const paths = form.getAll('path').map(String);
			if (files.length === 0) return fail(400, { message: 'Choose a folder first.' });

			const read: { path: string; filename: string; bytes: Uint8Array }[] = [];
			for (const [i, file] of files.entries()) {
				// Over the ceiling never becomes a buffer: the service would
				// refuse it, and reading it first is the cost without the use.
				if (file.size > limits.maxBytes) continue;
				read.push({
					// The relative path when the picker gave one, else the bare name.
					path: paths[i] || file.name,
					filename: file.name,
					bytes: new Uint8Array(await file.arrayBuffer())
				});
			}
			const skippedBySize = files.length - read.length;

			const result = await importFolder(buildCtx(locals.user!.id), read, {
				under: String(form.get('under') ?? '').trim() || undefined
			});
			return { success: true, ...result, skipped: result.skipped + skippedBySize };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	rename: async ({ request, locals }: IsolatedEvent) => {
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

	delete: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteAlbum(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
