import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import { isEmailConfigured } from '$lib/server/email';
import {
	checkSignUpAllowed,
	consumeInvite,
	instanceIsEmpty,
	registrationMode
} from '$lib/server/services/registration';
import { ServiceError } from '$lib/server/services/errors';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		return redirect(302, '/');
	}
	// The reset form says so up front when the server cannot send mail, rather
	// than claiming a link is on its way.
	//
	// `canRegister` decides whether the page offers registration at all: a
	// closed instance showing a "Register" link is a form that only ever says
	// no. The first account is always allowed, or a fresh install is unusable.
	const mode = registrationMode();
	const first = instanceIsEmpty();

	return {
		emailConfigured: isEmailConfigured(),
		canRegister: first || mode !== 'closed',
		needsInvite: !first && mode === 'invite',
		isFirstAccount: first
	};
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
	/**
	 * Register, if this instance is taking anybody.
	 *
	 * The check is repeated here rather than left to the hook in
	 * `hooks.server.ts`: this action calls better-auth in-process, so the
	 * request never passes the hook. Two doors, one rule.
	 */
	signUp: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';
		const now = new Date();

		let invite;
		try {
			invite = checkSignUpAllowed(formData.get('invite'), now).invite;
		} catch (error) {
			if (error instanceof ServiceError) return fail(403, { message: error.message });
			return fail(500, { message: 'Unexpected error' });
		}

		try {
			const created = await auth.api.signUpEmail({
				body: { email, password, name }
			});

			// Only once the account exists, so a taken address does not burn a code.
			if (invite && created?.user?.id) consumeInvite(invite.id, created.user.id, now);
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
