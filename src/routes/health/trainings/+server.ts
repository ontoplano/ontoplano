import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * "Trainings" was never a word anybody says.
 *
 * The thing is a workout, which is what the page itself already called them —
 * only the tab and the address said otherwise. The old one is in bookmarks and
 * in the app shell people have installed, so it answers rather than 404s.
 */
export const GET: RequestHandler = ({ url }) => {
	redirect(308, `/health/workouts${url.search}`);
};
