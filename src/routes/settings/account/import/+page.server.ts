import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { importTasks } from '$lib/server/services/imports';
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
