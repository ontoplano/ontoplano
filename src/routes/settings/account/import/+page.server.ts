import type { Actions, PageServerLoad } from './$types';
import { NOT_PORTABLE, keepBeforeImport } from '$lib/server/services/account-import';
import { importVaultAction } from '$lib/import-vault-action';
import {
	importAccountAction,
	importTasksAction,
	previewImportAction
} from '$lib/account-import-actions';
import { ENVELOPE, parseByteSize } from '$lib/server/body-limit';

/**
 * Bringing things in, on a page of its own.
 *
 * It used to be two cards at the bottom of the account page, below the
 * sessions and above the delete button — which put "restore an export over
 * everything you have" three inches from "change your password". Moving in is
 * its own act, done once, and it reads better as its own page than as the
 * tail of somebody else's.
 */
/** adapter-node's own default, which is what an instance that sets nothing has. */
const ADAPTER_DEFAULT = 512 * 1024;

export const load: PageServerLoad = async () => {
	/*
	 * The biggest thing this instance can actually be sent.
	 *
	 * `adapter-node` refuses a larger body with a plain 413 before any of this
	 * app's code runs, so the page has to know the number rather than find out
	 * by being refused. An export of an account with pictures in it passes 12MB
	 * easily — the one that prompted this was 16MB — and what came back was a
	 * 500 and "something went wrong on our side", which named nothing.
	 *
	 * `0` disables the limit outright, which is a deliberate answer and means
	 * there is no ceiling to warn about.
	 */
	const parsed = parseByteSize(process.env.BODY_SIZE_LIMIT);
	const limit = parsed === 0 ? 0 : (parsed ?? ADAPTER_DEFAULT);

	return {
		// Said on the page rather than written into it twice: the reasons live
		// beside the tables they are about, in account-import.ts.
		notPortable: Object.keys(NOT_PORTABLE).length,
		/** Bytes, or 0 for no ceiling. Already less the multipart framing. */
		uploadCeiling: limit === 0 ? 0 : Math.max(limit - ENVELOPE, 0)
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
	importTasks: importTasksAction,

	/**
	 * A vault of markdown becomes notebook entries.
	 *
	 * The files arrive as one JSON array of `{ path, text }`, read in the page:
	 * the browser can hand over a whole folder, and nothing is uploaded as a
	 * file — the same arrangement the task import uses, for the same reason.
	 * The path matters as well as the text, because a vault's folders are
	 * structure and they come across as tags.
	 */
	importVault: importVaultAction,

	previewImport: previewImportAction,

	/**
	 * And the restore, with this server's own safety copy taken first.
	 *
	 * Written beside the database rather than handed to the browser: it is a
	 * net for an operator asked "can you put Ana back", it has to exist whether
	 * or not anybody is still looking at the page, and the path lands on the
	 * audit line the import writes. A device cannot do that and does something
	 * else — see its `page.isolated.ts`.
	 */
	importAccount: (event) => importAccountAction(event, (userId) => keepBeforeImport(userId))
};
