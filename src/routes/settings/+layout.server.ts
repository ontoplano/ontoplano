import type { LayoutServerLoad } from './$types';
import { isSelfHosted } from '$lib/server/settings';
import { resolvePlan } from '$lib/server/services/subscriptions';
import { canEditInstance, isAdmin } from '$lib/server/services/admin';
import { seatOwnerOf, seatsFor } from '$lib/server/services/subscriptions';

/**
 * Which tabs the settings area shows.
 *
 * Deployment settings are not a user setting: self-hosted they belong to
 * the owner, hosted to the administrators. Billing does not exist on a
 * self-hosted instance at all — a box of your own sells nothing.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		canEditInstance: canEditInstance(locals.user!.id),
		canAdminister: isAdmin(locals.user!.id),
		// The same answer the billing page gives: it 404s for an account with
		// nothing billable — a family seat above all — so its tab must not show.
		billable: !isSelfHosted() && resolvePlan(locals.user!.id).billable,
		// Family is a tab for the people it belongs to: the payer of a plan with
		// more than one seat, and anybody sitting on one of those seats.
		family:
			!isSelfHosted() && (seatsFor(locals.user!.id) > 1 || seatOwnerOf(locals.user!.id) !== null)
	};
};
