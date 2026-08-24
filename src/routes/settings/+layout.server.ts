import type { LayoutServerLoad } from './$types';
import { isInstanceOwner } from '$lib/server/settings';

/**
 * Which tabs the settings area shows.
 *
 * Deployment settings are not a user setting, so their tab only exists for
 * whoever runs a self-hosted instance. It moves to /admin when roles land.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { canEditInstance: isInstanceOwner(locals.user!.id) };
};
