import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { checkPassword } from '$lib/passwords';
import { APIError } from 'better-auth/api';
import { refuse } from '$lib/http-errors';
import { authRefusal } from '$lib/server/auth-refusals';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (locals.user) redirect(302, '/');

	// better-auth sends the token as a query parameter; without one there is
	// nothing to do here.
	const token = url.searchParams.get('token') ?? '';
	return { token, invalid: !token, error: url.searchParams.get('error') };
};

export const actions: Actions = {
	reset: async ({ request }) => {
		const formData = await request.formData();
		const token = formData.get('token')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const confirm = formData.get('confirm')?.toString() ?? '';

		if (!token) return refuse(400, 'auth.refused.resetMissingToken');
		const weak = checkPassword(password);
		if (weak) return refuse(400, weak.key, 'values' in weak ? weak.values : undefined);
		if (password !== confirm) return refuse(400, 'auth.refused.passwordsDiffer');

		try {
			await auth.api.resetPassword({ body: { newPassword: password, token } });
		} catch (error) {
			if (error instanceof APIError)
				return refuse(400, authRefusal(error, 'auth.refused.linkExpired'));
			console.error('Password reset error:', error);
			return refuse(500, 'auth.refused.unexpected');
		}

		redirect(303, '/login?reset=1');
	}
};
