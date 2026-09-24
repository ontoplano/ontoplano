import { goalHandlers } from '$lib/services/goal-actions';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { archiveEntry, createEntry, deleteEntry, pinEntry, updateEntry } from '$lib/services/diary';
import { makeTodosFromEntry } from '$lib/services/note-todos';
import { removeNotebookPicture, setNotebookPicture } from '$lib/services/media';
import { setEntryPeople } from '$lib/services/people';
import { NOTEBOOK_PANEL_WIDTH_KEY, setPanelWidth } from '$lib/services/settings';
import { toActionFailure } from '$lib/http-errors';
import { describeTag, recolorTag, renameTag } from '$lib/services/tags';
import { importVaultAction } from '$lib/import-vault-action';
import { todoHandlers } from '$lib/services/todo-actions';
import { under } from '$lib/services/scoped-actions';
import { fileUnderNotebook } from '$lib/services/notebook-linking';
import { billHandlers } from '$lib/services/bill-actions';
import { habitHandlers } from '$lib/services/habit-actions';
import { ideaHandlers } from '$lib/services/idea-actions';
import { itemHandlers } from '$lib/services/item-actions';
import { ledgerHandlers } from '$lib/services/ledger-actions';
import { workoutHandlers } from '$lib/services/workout-actions';
import { recipeActions } from '../health/recipes/actions';
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
	/*
	 * What a label is, saved from inside a notebook.
	 *
	 * The same act as on the Tags screen and deliberately the same three
	 * calls: a label is the account's one word, so renaming it here renames it
	 * on the week too. Deleting one is not offered from in here — taking a
	 * word out of the vocabulary because one subject has finished with it is a
	 * decision for the screen that can see all of them.
	 */
	saveTag: async ({ request, locals }) => {
		const formData = await request.formData();
		const userId = locals.user!.id;
		try {
			const after = renameTag(userId, Number(formData.get('id')), formData.get('label'));
			recolorTag(userId, after.id, formData.get('color'));
			describeTag(userId, after.id, formData.get('description'));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	create: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			createNotebook(buildCtx(locals.user!.id), {
				title: formData.get('heading'),
				// Where it goes, as its own field: the place is part of the name,
				// and the service is what puts the two halves together.
				parent: formData.get('parent'),
				description: formData.get('description'),
				defaultTags: formData.get('defaultTags'),
				// What it holds, when whoever is making it said. The dialog does
				// not ask — a notebook is made in one field and answered for
				// afterwards — so this is usually the default.
				modules: formData.has('modules') ? formData.getAll('modules') : undefined
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
				parent: formData.get('parent'),
				description: formData.get('description'),
				defaultTags: formData.get('defaultTags'),
				/*
				 * What it holds, when the form asked about it.
				 *
				 * `modulesPosted` rather than the boxes themselves: unticking
				 * every one of them sends no `modules` field at all, which is
				 * indistinguishable from a form that never asked — and would
				 * quietly leave the tabs as they were instead of clearing them.
				 * A form that asked says so.
				 */
				modules: formData.has('modulesPosted') ? formData.getAll('modules') : undefined
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

	/**
	 * A picture for the notebook, replacing whatever was there.
	 *
	 * Choosing the file is the whole act — there is no second button — the same
	 * as a person's face, which this is the other of. The size is checked in the
	 * browser first, because a body over the adapter's limit is refused before
	 * this code runs and answers with something no form can read.
	 */
	setPicture: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = Number(formData.get('id'));
		const file = formData.get('file');
		if (!id) return fail(400, { message: 'No notebook' });
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { message: 'Choose a picture first.' });

		try {
			await setNotebookPicture(buildCtx(locals.user!.id), id, {
				bytes: new Uint8Array(await file.arrayBuffer()),
				filename: file.name,
				alt: String(formData.get('title') ?? '')
			});
			return { success: true, action: 'setPicture' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removePicture: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			removeNotebookPicture(buildCtx(locals.user!.id), Number(formData.get('id')));
			return { success: true, action: 'removePicture' };
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

			/*
			 * A checklist written here becomes the tasks it describes, in one
			 * press.
			 *
			 * The offer used to be an icon on the note's row, found after the
			 * note was written and only by somebody who went looking. Offering
			 * it while the checkboxes are being typed is the moment it is
			 * wanted — so the composer shows it the instant a `- [ ]` appears,
			 * and this is what that button posts.
			 */
			if (formData.get('alsoTodos')) {
				const made = makeTodosFromEntry(ctx, id);
				return { success: true, action: 'addEntry', made: made.ids.length };
			}
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
	 * Put something that already exists under this notebook.
	 *
	 * One action for every module, because linking is one act — see
	 * `$lib/services/notebook-linking`. The module travels in the form rather
	 * than being nine actions with the same body.
	 */
	linkIntoNotebook: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			fileUnderNotebook(
				buildCtx(locals.user!.id),
				String(formData.get('module') ?? ''),
				formData.get('id'),
				Number(formData.get('notebookId')) || null
			);
			return { success: true, action: 'linkIntoNotebook' };
		} catch (e) {
			return toActionFailure(e);
		}
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
	// A goal written from inside a notebook, the way a task already was.
	/*
	 * A goal is made, edited, closed and deleted from inside the notebook it
	 * belongs to, the same way a todo already was — the same handlers the goals
	 * room uses, under names this route has free. The names live in
	 * `$lib/goal-action-names`.
	 */
	goalCreate: goalHandlers.create,
	goalUpdate: goalHandlers.update,
	goalProgress: goalHandlers.setProgress,
	goalClose: goalHandlers.close,
	goalLinks: goalHandlers.setLinks,
	goalTodoStatus: goalHandlers.setTodoStatus,
	goalDelete: goalHandlers.remove,
	todoCreate: todoHandlers.create,
	todoUpdate: todoHandlers.update,
	todoStatus: todoHandlers.setStatus,
	todoSchedule: todoHandlers.schedule,
	todoDelegate: todoHandlers.delegate,
	todoArchive: todoHandlers.archive,
	todoDelete: todoHandlers.remove,

	/*
	 * Every other module a notebook can hold, answering here too.
	 *
	 * Each room's own handlers, mounted under the module's prefix — ticking a
	 * habit on a notebook's Habits tab runs the code the Health room runs, and
	 * a bill paid here is paid there. `under` applies the same naming rule the
	 * markup's action names come from, so a form and its handler cannot drift
	 * apart; see `$lib/services/scoped-actions`.
	 *
	 * All of them, whatever this notebook is switched on for: what a notebook
	 * holds is a preference about what to draw, not about what may be posted,
	 * and a tab that appeared the moment a module was switched on would
	 * otherwise post to an action that was not mounted.
	 */
	...under('idea', ideaHandlers),
	...under('item', itemHandlers),
	...under('ledger', ledgerHandlers),
	...under('bill', billHandlers),
	...under('habit', habitHandlers),
	...under('workout', workoutHandlers),
	...under('recipe', recipeActions)
} satisfies Actions;
