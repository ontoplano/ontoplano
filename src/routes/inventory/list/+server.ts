import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The inventory was two tabs for a day.
 *
 * "To buy" and "What I have" were the same rows read twice, and splitting them
 * meant a thing you owned and a thing you needed lived on different screens
 * with different powers — the second had no price, no tick, no archiving and
 * no category. One page, with the locations beside it.
 */
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `/inventory${url.search}`);
};
