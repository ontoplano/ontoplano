import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Where the kitchen used to be.
 *
 * Recipes and meals are tabs of Health now — eating is part of looking after
 * yourself, and a room of its own for two pages was one room too many. The old
 * addresses are in people's bookmarks, in the phone app's cached shell and in
 * links somebody sent themselves, so they answer with a redirect rather than a
 * 404. Permanent, because this is not coming back.
 */
export const GET: RequestHandler = ({ params, url }) => {
	const rest = params.path ? `/${params.path}` : '';
	redirect(308, `/health${rest}${url.search}`);
};
