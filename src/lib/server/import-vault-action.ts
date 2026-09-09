import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { importVault } from '$lib/server/services/import-vault';

/**
 * A folder of markdown, turned into a notebook.
 *
 * Shared rather than written twice. It began as an action on the account's
 * import screen, and Notebooks — where somebody actually is when they think of
 * it — only linked there. Notebooks has the form inline now, and two pages
 * with the same form need the same action behind it, or they drift into
 * disagreeing about what a bad file is.
 */
export async function importVaultAction(event: Pick<RequestEvent, 'request' | 'locals'>) {
	const formData = await event.request.formData();

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
		const result = importVault(buildCtx(event.locals.user!.id), {
			files,
			notebook: formData.get('notebook')
		});

		const parts = [`Imported ${result.imported} notes into “${result.notebook}”.`];
		if (result.tags > 0) parts.push(`${result.tags} tags came with them.`);
		if (result.skipped.length > 0) {
			parts.push(`Left behind: ${result.skipped.slice(0, 5).join(', ')}.`);
		}

		return { success: true, action: 'importVault', message: parts.join(' ') };
	} catch (e) {
		return toActionFailure(e);
	}
}
