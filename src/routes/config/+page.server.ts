import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * /config is now /settings/preferences.
 *
 * Kept as a permanent redirect because people bookmark it, and because the
 * theme form in the nav posted here for a year.
 */
export const load: PageServerLoad = async () => {
	redirect(301, '/settings/preferences');
};
