import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportAccount } from '$lib/server/services/account';

/**
 * The account's data as a JSON download.
 *
 * A +server route rather than a form action, because the answer is a file
 * rather than a page — the "no +server routes" convention in AGENTS.md is
 * about mutations, and this reads.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const data = exportAccount(locals.user!.id);
	const stamp = data.exportedAt.slice(0, 10);

	return json(data, {
		headers: {
			'Content-Disposition': `attachment; filename="ontoplano-export-${stamp}.json"`,
			'Cache-Control': 'no-store'
		}
	});
};
