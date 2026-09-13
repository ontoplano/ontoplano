import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportAccount } from '$lib/server/services/account';
import { toJsonError } from '$lib/http-errors';

/**
 * The account's data as a JSON download.
 *
 * A +server route rather than a form action, because the answer is a file
 * rather than a page — the "no +server routes" convention is
 * about mutations, and this reads.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	// `?pictures=no` leaves the picture bytes out — the file that moves an
	// account between instances, small enough to fit any instance's body limit.
	const withoutPictures = url.searchParams.get('pictures') === 'no';

	let data;
	try {
		data = exportAccount(locals.user!.id, new Date(), { withoutPictures });
	} catch (e) {
		// Two a day; the message says when the next one unlocks.
		return toJsonError(e);
	}

	const stamp = data.exportedAt.slice(0, 10);
	const name = withoutPictures
		? `ontoplano-export-${stamp}-no-pictures.json`
		: `ontoplano-export-${stamp}.json`;

	return json(data, {
		headers: {
			'Content-Disposition': `attachment; filename="${name}"`,
			'Cache-Control': 'no-store'
		}
	});
};
