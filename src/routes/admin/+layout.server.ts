import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canEditInstance, isAdmin } from '$lib/server/services/admin';
import { isSelfHosted } from '$lib/server/settings';

/**
 * Everything under /admin, behind one check.
 *
 * A 404 rather than a 403: a page you may not see should not confirm that it
 * exists (I3). The check is repeated in every action, because an action can be
 * posted without loading the page it belongs to.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!isAdmin(locals.user!.id)) error(404, 'Not found');

	// The same three flags the settings layout loads, because this area draws
	// the same tab row: without them Administration is a page you can reach and
	// not leave.
	return {
		canEditInstance: canEditInstance(locals.user!.id),
		canAdminister: true,
		billable: !isSelfHosted()
	};
};
