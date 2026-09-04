import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isSelfHosted } from '$lib/server/settings';
import { toActionFailure } from '$lib/server/http-errors';
import {
	addToPlan,
	membersOf,
	removeFromPlan,
	seatOwnerAccount,
	seatsFor
} from '$lib/server/services/subscriptions';

/**
 * Who else is on this plan.
 *
 * This was a card at the bottom of Billing, which put the one thing a family
 * payer comes back for — adding the fourth person, months later — underneath
 * the prices and the usage bars. It is its own tab now, and the tab only
 * exists for an account that is on a family plan: the payer, or somebody
 * whose seat is on somebody else's.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (isSelfHosted()) error(404, 'Not found');

	const seats = seatsFor(locals.user!.id);
	const owner = seatOwnerAccount(locals.user!.id);
	if (seats <= 1 && !owner) error(404, 'Not found');

	return { seats, members: membersOf(locals.user!.id), seatOwner: owner };
};

export const actions: Actions = {
	/*
	 * Putting somebody on the plan, and taking them off.
	 *
	 * By address, and only for an account that already exists: this hands out a
	 * paid plan, so it must not become a way to create accounts on an instance
	 * whose registration is closed.
	 */
	addSeat: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			const added = addToPlan(locals.user!.id, String(formData.get('who') ?? ''));
			return { success: true, added: added.name };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	removeSeat: async ({ request, locals }) => {
		const formData = await request.formData();
		try {
			removeFromPlan(locals.user!.id, String(formData.get('member') ?? ''));
			return { success: true, removed: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
