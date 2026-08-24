import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deleteAccount } from '$lib/server/services/account';

export const load: PageServerLoad = async ({ locals }) => {
	return { email: locals.user!.email, name: locals.user!.name };
};

export const actions: Actions = {
	/**
	 * Deleting an account is irreversible, so it asks for the account's own
	 * email address rather than a yes/no — the point is to make it impossible to
	 * do by reflex, not to add a step.
	 */
	delete: async ({ request, locals, cookies }) => {
		const user = locals.user!;
		const formData = await request.formData();
		const confirmation = formData.get('email')?.toString()?.trim() ?? '';

		if (confirmation.toLowerCase() !== user.email.toLowerCase())
			return fail(400, { message: 'Type your email address exactly to confirm' });

		deleteAccount(user.id);

		// The session row is gone with the account; clear the cookie so the
		// browser is not carrying a token pointing at nothing.
		for (const name of cookies.getAll().map((c) => c.name)) {
			if (name.startsWith('better-auth')) cookies.delete(name, { path: '/' });
		}

		redirect(303, '/login');
	}
};
