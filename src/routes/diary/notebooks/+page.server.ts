import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { createEntry, deleteEntry, updateEntry } from '$lib/server/services/diary';
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

	/**
	 * Edit a note, and delete one.
	 *
	 * Notes do not appear in the Diary, so this is the only place they can be
	 * changed — without these a note written here could never be corrected.
	 * `notebookId` goes back in on the way through, so editing a note does not
	 * quietly take it out of its notebook.
	 */
	updateEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			updateEntry(buildCtx(locals.user!.id), Number(formData.get('id')), {
				content: formData.get('content'),
				notebookId: Number(formData.get('notebookId'))
			});
			return { success: true, action: 'updateEntry' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			deleteEntry(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'deleteEntry' };
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
