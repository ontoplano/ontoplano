/**
 * Bringing things in, on an instance that is a device.
 *
 * The same four ways in as on a server — a list out of another app, a folder
 * of markdown, a preview of an export, and the restore itself — over the
 * device's own database. None of it needed a server: reading the file and
 * refilling every table is `$lib/services/account-import.ts`, which both
 * instances run.
 *
 * Two things differ, and neither is a capability. There is no body limit to
 * warn about, because nothing is being sent anywhere: the page reads the file
 * and the worker beside it does the work. And the copy taken before a restore
 * destroys what is here goes to the person as a download rather than to a
 * directory beside the database — a file in this device's private storage that
 * nothing can open is not a safety net. The page takes it; see `+page.svelte`.
 */
import { NOT_PORTABLE } from '$lib/services/account-import.js';
import { importVaultAction } from '$lib/import-vault-action.js';
import {
	importAccountAction,
	importTasksAction,
	previewImportAction
} from '$lib/account-import-actions.js';
import type { IsolatedEvent } from '$lib/isolated/routes.js';

export async function load() {
	return {
		onDevice: true,
		notPortable: Object.keys(NOT_PORTABLE).length,
		// Nothing is uploaded here, so there is no ceiling to say anything about.
		uploadCeiling: 0
	};
}

export const actions = {
	importTasks: importTasksAction,
	importVault: importVaultAction,
	previewImport: previewImportAction,

	/**
	 * And the restore, with the copy the page took first.
	 *
	 * A server writes that copy beside its database, where an operator can
	 * find it. There is no such place here — a file in this device's private
	 * storage that nothing can open is not a safety net — so the page
	 * downloads this instance as a file before it submits, and refuses to
	 * submit if that did not work. What arrives here is its name, for the
	 * audit line, so the log still says a copy was taken and what it is called.
	 */
	importAccount: (event: IsolatedEvent) =>
		importAccountAction(event, (_userId, formData) => String(formData.get('rescue') ?? '') || null)
};
