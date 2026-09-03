import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { importTasks } from '$lib/server/services/imports';
import { importVault } from '$lib/server/services/import-vault';
import { importAccount, NOT_PORTABLE } from '$lib/server/services/account-import';
import { toActionFailure } from '$lib/server/services/errors';

/**
 * Bringing things in, on a page of its own.
 *
 * It used to be two cards at the bottom of the account page, below the
 * sessions and above the delete button — which put "restore an export over
 * everything you have" three inches from "change your password". Moving in is
 * its own act, done once, and it reads better as its own page than as the
 * tail of somebody else's.
 */
export const load: PageServerLoad = async () => {
	return {
		// Said on the page rather than written into it twice: the reasons live
		// beside the tables they are about, in account-import.ts.
		notPortable: Object.keys(NOT_PORTABLE).length
	};
};

export const actions: Actions = {
	/**
	 * Take a list out of Todoist, Google Tasks or Google Keep and put it here.
	 *
	 * The parsing and the writing are `services/imports.ts`; this reads the
	 * form. The text arrives in the textarea whether it was pasted or read from
	 * a chosen file — the page reads the file itself, so what is about to be
	 * imported is visible before the button is pressed, and no file is ever
	 * uploaded.
	 */
	importTasks: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			const result = importTasks(buildCtx(locals.user!.id), {
				text: formData.get('text'),
				notebook: formData.get('notebook'),
				includeDone: formData.get('includeDone') === 'on'
			});

			// Everything it did and everything it did not: a count somebody can
			// check against the app they came from, and what was left behind.
			const parts = [`Imported ${result.imported} into \u201c${result.notebook}\u201d.`];
			if (result.datesDropped > 0) {
				parts.push(
					`${result.datesDropped} had a date this does not read \u2014 a repeat rule, or "tomorrow".`
				);
			}
			if (result.skipped.length > 0) {
				parts.push(`Left behind: ${result.skipped.slice(0, 5).join(', ')}.`);
			}

			return { success: true, action: 'importTasks', message: parts.join(' ') };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * A vault of markdown becomes notebook entries.
	 *
	 * The files arrive as one JSON array of `{ path, text }`, read in the page:
	 * the browser can hand over a whole folder, and nothing is uploaded as a
	 * file — the same arrangement the task import uses, for the same reason.
	 * The path matters as well as the text, because a vault's folders are
	 * structure and they come across as tags.
	 */
	importVault: async ({ request, locals }) => {
		const formData = await request.formData();

		let files: { path: string; text: string }[];
		try {
			const raw = JSON.parse(String(formData.get('files') ?? '[]'));
			if (!Array.isArray(raw)) throw new Error('not an array');
			files = raw
				.filter((f) => f && typeof f.path === 'string' && typeof f.text === 'string')
				.map((f) => ({ path: f.path, text: f.text }));
		} catch {
			return fail(400, { message: 'Could not read those files. Choose them again.' });
		}

		try {
			const result = importVault(buildCtx(locals.user!.id), {
				files,
				notebook: formData.get('notebook')
			});

			const parts = [`Imported ${result.imported} notes into \u201c${result.notebook}\u201d.`];
			if (result.tags > 0) parts.push(`${result.tags} tags came with them.`);
			if (result.skipped.length > 0) {
				parts.push(`Left behind: ${result.skipped.slice(0, 5).join(', ')}.`);
			}

			return { success: true, action: 'importVault', message: parts.join(' ') };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/**
	 * Put an exported account back \u2014 into this one, over what is here.
	 *
	 * Destructive, so it asks for a typed word rather than a click: this
	 * empties the account before it fills it, and the one thing worse than an
	 * import that fails is an import that half-succeeds over a real week.
	 * `importAccount` is one transaction for the same reason.
	 */
	importAccount: async ({ request, locals }) => {
		const formData = await request.formData();

		if (
			String(formData.get('confirm') ?? '')
				.trim()
				.toUpperCase() !== 'REPLACE'
		)
			return fail(400, {
				message: 'Type REPLACE to confirm \u2014 this empties the account first.'
			});

		try {
			const result = importAccount(locals.user!.id, formData.get('text'));

			const parts = [
				`Imported ${result.total} rows${result.from ? ` from ${result.from.email}` : ''}.`
			];
			if (result.skipped.length > 0) {
				parts.push(`Left behind: ${result.skipped.map((s) => `${s.name} (${s.why})`).join('; ')}.`);
			}

			return { success: true, action: 'importAccount', message: parts.join(' ') };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
