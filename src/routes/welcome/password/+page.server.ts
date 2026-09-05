import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { chooseFirstPassword, passwordPending } from '$lib/server/services/family-invite';
import { toActionFailure } from '$lib/server/http-errors';
import { ValidationError } from '$lib/server/services/errors';

/**
 * The one page between a family invitation's link and the app.
 *
 * The account it opens was made with a password nobody knows, so the first
 * thing to do with it is choose one — before the welcome wizard, because a
 * person who closes the tab after setup would otherwise own an account they
 * cannot get back into except through a password reset they don't know to ask
 * for.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// Anybody who already has a password has no business here.
	if (!passwordPending(locals.user!.id)) redirect(302, '/welcome');
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();

		try {
			const password = formData.get('password');
			if (password !== formData.get('confirm'))
				throw new ValidationError('The two passwords are not the same');

			await chooseFirstPassword(locals.user!.id, password);
		} catch (e) {
			return toActionFailure(e);
		}

		redirect(303, '/welcome');
	}
};
