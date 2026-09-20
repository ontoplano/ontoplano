import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { archiveEntry, createEntry, deleteEntry, pinEntry, updateEntry } from '$lib/services/diary';
import { makeTodosFromEntry } from '$lib/services/note-todos';
import { setEntryPeople } from '$lib/services/people';
import { NOTEBOOK_PANEL_WIDTH_KEY, setPanelWidth } from '$lib/services/settings';
import { toActionFailure } from '$lib/http-errors';
import { importVaultAction } from '$lib/import-vault-action';
import { todoHandlers } from '$lib/services/todo-actions';
import {
	createNotebook,
	deleteNotebook,
	setNotebookClosed,
	setNotebookShared,
	updateNotebook
} from '$lib/services/notebooks';

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
				title: formData.get('heading'),
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
				title: formData.get('heading'),
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

	/**
	 * Put a note away, or take it back out.
	 *
	 * Hidden, not deleted: the note stays in the notebook and comes back
	 * unchanged. No confirmation, because this is the reversible one — the
	 * button beside it is what deletes, and that one asks.
	 */
	archiveEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			archiveEntry(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('away') !== 'false'
			);
			return { success: true, action: 'archiveEntry' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Keep a note at the top of its notebook, or stop.
	 *
	 * As many as somebody likes: what is worth having in front of you when you
	 * open a notebook is not a number anybody else can pick for you.
	 */
	pinEntry: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			pinEntry(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.get('pinned') !== 'false'
			);
			return { success: true, action: 'pinEntry' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * A note that is a checklist, made into the todos it describes.
	 *
	 * `only` is the positions the person left ticked in the dialog, so a list
	 * with three things already done can cross over without them. The note is
	 * left alone — deleting it is the button beside this one, because "also put
	 * these on my list" and "move these onto my list" are both real answers.
	 */
	entryToTodos: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const only = formData
				.getAll('only')
				.map(Number)
				.filter((at) => Number.isInteger(at));
			const made = makeTodosFromEntry(
				buildCtx(locals.user!.id),
				Number(formData.get('id')),
				formData.has('only') ? only : undefined
			);
			return { success: true, action: 'entryToTodos', made: made.ids.length };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Where the reader dragged the divider between the list and the panel.
	 *
	 * Posted once, when they let go — a drag across the screen is two hundred
	 * pixels and would otherwise be two hundred writes.
	 */
	setPanelWidth: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			setPanelWidth(
				buildCtx(locals.user!.id).userId,
				NOTEBOOK_PANEL_WIDTH_KEY,
				Number(formData.get('rem'))
			);
			return { success: true, action: 'setPanelWidth' };
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
	 * `$lib/import-vault-action`. It is here because the form is here:
	 * somebody with a vault is standing on Notebooks when they think of it, and
	 * sending them to a settings page headed "An Obsidian vault" was a door
	 * nobody found.
	 */
	importVault: importVaultAction,

	/*
	 * The todos filed under this notebook, operated on here.
	 *
	 * A notebook's Tasks tab is the to-do room looking at one subject, so it
	 * runs the room's own handlers rather than a second implementation of them.
	 * Prefixed because the plain names above already belong to the notebook —
	 * see `$lib/services/todo-actions` for the names the markup posts to.
	 */
	todoCreate: todoHandlers.create,
	todoUpdate: todoHandlers.update,
	todoStatus: todoHandlers.setStatus,
	todoSchedule: todoHandlers.schedule,
	todoDelegate: todoHandlers.delegate,
	todoArchive: todoHandlers.archive,
	todoDelete: todoHandlers.remove
} satisfies Actions;
