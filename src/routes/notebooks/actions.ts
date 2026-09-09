import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/server/services/ctx';
import { createEntry, deleteEntry, updateEntry } from '$lib/server/services/diary';
import { setEntryPeople } from '$lib/server/services/people';
import { toActionFailure } from '$lib/server/http-errors';
import { importVaultAction } from '$lib/server/import-vault-action';
import {
	createNotebook,
	deleteNotebook,
	setNotebookClosed,
	setNotebookShared,
	updateNotebook
} from '$lib/server/services/notebooks';

/**
 * What can be done to a notebook, wherever it is on screen.
 *
 * The index shows a notebook beside the list; `[id]` shows one on its own. The
 * same composer and the same buttons are on both, so the actions live here
 * rather than being written twice and drifting.
 */
export const notebookActions = {
	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createNotebook(buildCtx(locals.user!.id), {
				title: formData.get('heading'),
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
				title: formData.get('heading'),
				description: formData.get('description')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** The owner's switch: everybody on their family plan may read and write. */
	setShared: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setNotebookShared(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('shared') === 'true'
			);
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
			const ctx = buildCtx(locals.user!.id);
			const id = createEntry(ctx, {
				content: formData.get('content'),
				tags: formData.get('tags'),
				notebookId
			});
			setEntryPeople(ctx, id, formData.get('people'));
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
			// Absent for a note whose notebook was deleted: editing one must not
			// adopt it into whatever notebook happens to be on screen.
			const notebookId = Number(formData.get('notebookId')) || null;

			const ctx = buildCtx(locals.user!.id);
			const id = Number(formData.get('id'));
			updateEntry(ctx, id, {
				content: formData.get('content'),
				tags: formData.get('tags'),
				notebookId
			});
			setEntryPeople(ctx, id, formData.get('people'));
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
		} catch (e) {
			return toActionFailure(e);
		}

		// The URL still names the notebook that was just deleted, and reloading
		// it would answer 404 — correctly, and unhelpfully, to the person who
		// deleted it.
		redirect(303, '/notebooks');
	},

	/**
	 * A folder of markdown, brought in from this page.
	 *
	 * The same action the account's import screen runs — see
	 * `$lib/server/import-vault-action`. It is here because the form is here:
	 * somebody with a vault is standing on Notebooks when they think of it, and
	 * sending them to a settings page headed "An Obsidian vault" was a door
	 * nobody found.
	 */
	importVault: importVaultAction
} satisfies Actions;
