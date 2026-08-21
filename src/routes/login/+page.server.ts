import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import { isEmailConfigured } from '$lib/server/email';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, '/');
	}
	// The reset form says so up front when the server cannot send mail, rather
	// than claiming a link is on its way.
	return { emailConfigured: isEmailConfigured() };
};

export const actions: Actions = {
	signIn: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		try {
			await auth.api.signInEmail({
				body: { email, password }
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Sign in failed' });
			}
			console.error('Sign-in non-API error:', error);
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/');
	},
	signUp: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';

		try {
			await auth.api.signUpEmail({
				body: { email, password, name }
			});
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || 'Registration failed' });
			}
			return fail(500, { message: 'Unexpected error' });
		}

		return redirect(302, '/');
	},
	/**
	 * Ask for a reset link.
	 *
	 * Always reports the same thing whether or not the address exists — the
	 * response is otherwise a way to enumerate who has an account here.
	 */
	requestReset: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString()?.trim() ?? '';

		if (!email) return fail(400, { message: 'Enter your email address' });

		try {
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: '/login/reset' }
			});
		} catch (error) {
			// Logged, not surfaced: a failure here would otherwise reveal whether
			// the address is registered.
			if (!(error instanceof APIError)) console.error('Reset request error:', error);
		}

		return {
			success: true,
			action: 'requestReset',
			message: isEmailConfigured()
				? 'If that address has an account, a reset link is on its way.'
				: 'This server has no mail configured, so the link was written to its log instead.'
		};
	},

	signOut: async (event) => {
		await auth.api.signOut({
			headers: event.request.headers
		});
		return redirect(302, '/login');
	}
};
