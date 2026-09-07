import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Where the shopping list used to be, on its own.
 *
 * It is one half of Inventory now — "I need it" beside "I have it, and it is
 * in the second drawer" — because they were always the same rows. The address
 * is in bookmarks and in the installed app's shell, so it answers.
 */
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `/inventory${url.search}`);
};
