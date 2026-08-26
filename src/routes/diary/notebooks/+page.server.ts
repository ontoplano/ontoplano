import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { createEntry } from '$lib/server/services/diary';
import { toActionFailure } from '$lib/server/services/errors';
import {
	contentsOf,
	createNotebook,
	deleteNotebook,
	listNotebooks,
	setNotebookClosed,
	updateNotebook
} from '$lib/server/services/notebooks';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);
	const asked = Number(url.searchParams.get('notebook'));
	const notebooks = listNotebooks(ctx);

	// Opening the page with nothing chosen should still show something, so the
	// first notebook stands in until you pick another.
	const selected =
		Number.isFinite(asked) && asked > 0 ? asked : (notebooks.find((n) => !n.closedAt)?.id ?? null);

	return {
		notebooks,
		selected,
		contents: selected ? contentsOf(ctx, selected) : null
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createNotebook(buildCtx(locals.user!.id), {
				title: formData.get('title'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateNotebook(buildCtx(locals.user!.id), Number(formData.get('id')), {
				title: formData.get('title'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	setClosed: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setNotebookClosed(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('closed') === 'true'
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Write a note against this notebook, here.
	 *
	 * The entry is an ordinary diary entry with the notebook set — the same row
	 * the Diary page writes — because a notebook is a subject you write about,
	 * not a second journal. What was missing was only the place to type it:
	 * writing about the kitchen renovation meant going to Diary and remembering
	 * to pick the notebook from a dropdown.
	 */
	addEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		const notebookId = Number(formData.get('notebookId'));
		if (!notebookId) return fail(400, { message: 'No notebook chosen' });

		try {
			createEntry(buildCtx(locals.user!.id), {
				content: formData.get('content'),
				tags: formData.get('tags'),
				notebookId
			});
			return { success: true, action: 'addEntry' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	delete: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteNotebook(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
