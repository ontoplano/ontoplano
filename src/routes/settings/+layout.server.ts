import type { LayoutServerLoad } from './$types';
import { isInstanceOwner, isSelfHosted } from '$lib/server/settings';
import { isAdmin } from '$lib/server/services/admin';

/**
 * Which tabs the settings area shows.
 *
 * Deployment settings are not a user setting, so their tab only exists for
 * whoever runs a self-hosted instance. Billing does not exist there at all —
 * an instance on your own box sells nothing.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		canEditInstance: isInstanceOwner(locals.user!.id),
		canAdminister: isAdmin(locals.user!.id),
		billable: !isSelfHosted()
	};
};
