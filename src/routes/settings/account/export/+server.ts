import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportAccount } from '$lib/server/services/account';
import { toJsonError } from '$lib/server/services/errors';

/**
 * The account's data as a JSON download.
 *
 * A +server route rather than a form action, because the answer is a file
 * rather than a page — the "no +server routes" convention is
 * about mutations, and this reads.
 */
export const GET: RequestHandler = async ({ locals }) => {
	let data;
	try {
		data = exportAccount(locals.user!.id);
	} catch (e) {
		// Two a day; the message says when the next one unlocks.
		return toJsonError(e);
	}

	const stamp = data.exportedAt.slice(0, 10);

	return json(data, {
		headers: {
			'Content-Disposition': `attachment; filename="ontoplano-export-${stamp}.json"`,
			'Cache-Control': 'no-store'
		}
	});
};
