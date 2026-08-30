import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { checkPassword } from '$lib/passwords';
import { APIError } from 'better-auth/api';

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

		if (!token) return fail(400, { message: 'This reset link is missing its token' });
		const weak = checkPassword(password);
		if (weak) return fail(400, { message: weak });
		if (password !== confirm) return fail(400, { message: 'The two passwords do not match' });

		try {
			await auth.api.resetPassword({ body: { newPassword: password, token } });
		} catch (error) {
			if (error instanceof APIError)
				return fail(400, {
					message: error.message || 'That link has expired or has already been used'
				});
			console.error('Password reset error:', error);
			return fail(500, { message: 'Unexpected error' });
		}

		redirect(303, '/login?reset=1');
	}
};
