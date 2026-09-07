import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Where this week's meals used to be.
 *
 * The tab was a read-only week and a list of what to buy — the first is the
 * plan, which draws meals beside everything else, and the second is the
 * shopping list, which those ingredients were already on. Putting a recipe on
 * a day is a button on the recipe now, so this address has nothing left to
 * show and sends people where the act lives.
 */
export const GET: RequestHandler = () => {
	redirect(308, '/health/recipes');
};
