/**
 * The account's data as a JSON download, from a device.
 *
 * The same file the server writes — `collectAccount` walks every table holding
 * user data, and that walk is one piece of code both instances run. What is
 * not here is the policy around it: two a day is a limit on somebody asking a
 * server they do not own to gather megabytes for them, and an audit line is a
 * note to an operator. There is no server here and no operator; asking this
 * phone for a copy of what is on it is not something to ration.
 */
import { json } from '@sveltejs/kit';
import { collectAccount } from '$lib/services/account-data.js';
import { toJsonError } from '$lib/http-errors.js';
import type { IsolatedEvent } from '$lib/isolated/routes.js';

export async function GET({ locals, url }: IsolatedEvent) {
	let data;
	try {
		data = collectAccount(locals.user!.id, new Date());
	} catch (e) {
		return toJsonError(e);
	}

	// `?pictures=no` leaves the picture bytes out, the same switch the server's
	// endpoint takes — a file small enough to carry to another instance.
	if (url.searchParams.get('pictures') === 'no')
		for (const table of ['media', 'albumMedia', 'mediaTags', 'recipeImages']) data.data[table] = [];

	const stamp = data.exportedAt.slice(0, 10);
	const name =
		url.searchParams.get('pictures') === 'no'
			? `ontoplano-export-${stamp}-no-pictures.json`
			: `ontoplano-export-${stamp}.json`;

	return json(data, {
		headers: { 'content-disposition': `attachment; filename="${name}"` }
	});
}
