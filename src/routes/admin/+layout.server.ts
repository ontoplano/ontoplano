import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdmin } from '$lib/server/services/admin';

/**
 * Everything under /admin, behind one check.
 *
 * A 404 rather than a 403: a page you may not see should not confirm that it
 * exists (I3). The check is repeated in every action, because an action can be
 * posted without loading the page it belongs to.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user!.id)) error(404, 'Not found');
	return {};
};
