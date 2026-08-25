import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth, verifyPassword } from '$lib/server/auth';
import { isEmailConfigured } from '$lib/server/email';
import { deleteAccount, exportAllowance, hoursUntil } from '$lib/server/services/account';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/services/errors';
import { listSessions, sessionTokenById } from '$lib/server/services/sessions';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		email: locals.user!.email,
		emailVerified: locals.user!.emailVerified,
		sessions: listSessions(buildCtx(locals.user!.id), locals.session?.token),
		// Both credential changes are confirmed by mail, so the page says up
		// front when this server has no transport and the link will land in its
		// log instead.
		emailConfigured: isEmailConfigured(),
		exports: (() => {
			const allowance = exportAllowance(locals.user!.id);
			return {
				remaining: allowance.remaining,
				unlocksIn: allowance.nextAt ? hoursUntil(allowance.nextAt) : null
			};
		})()
	};
};

/** better-auth's messages are already user-facing; anything else is a bug. */
function authFailure(error: unknown, fallback: string) {
	if (error instanceof APIError) return fail(400, { message: error.message || fallback });
	console.error('Account action error:', error);
	return fail(500, { message: 'Unexpected error' });
}

export const actions: Actions = {
	/**
	 * Ask to move the account to another address.
	 *
	 * Nothing changes here: better-auth mails a confirmation and the swap
	 * happens when the link is followed. The current address stays the one that
	 * signs in until then.
	 */
	changeEmail: async ({ request, locals }) => {
		const user = locals.user!;
		const formData = await request.formData();
		const newEmail = formData.get('newEmail')?.toString()?.trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		if (!newEmail) return fail(400, { message: 'Enter the new address' });
		if (newEmail.length > 254) return fail(400, { message: 'That address is too long' });
		if (!(await verifyPassword(user.id, password)))
			return fail(400, { message: 'That is not your current password' });

		try {
			await auth.api.changeEmail({
				body: { newEmail, callbackURL: '/settings/account' },
				headers: request.headers
			});
		} catch (error) {
			return authFailure(error, 'Could not change the address');
		}

		// A verified account approves the move from the address it is leaving; an
		// unverified one has nothing to approve with, so the link goes to the new
		// address instead. Either way the swap waits for a click.
		const sentTo = user.emailVerified ? user.email : newEmail;

		return {
			success: true,
			action: 'changeEmail',
			message: isEmailConfigured()
				? `Check ${sentTo} for a link. Your address changes once it is followed.`
				: `This server has no mail configured, so the link for ${sentTo} was written to its log instead.`
		};
	},

	/**
	 * Change the password, and sign every other session out.
	 *
	 * Someone changing their password is often doing it because they think
	 * somebody else is logged in, so the other sessions go with it.
	 */
	changePassword: async ({ request }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString() ?? '';
		const newPassword = formData.get('newPassword')?.toString() ?? '';
		const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

		if (!currentPassword || !newPassword) return fail(400, { message: 'Fill in both passwords' });
		if (newPassword !== confirmPassword)
			return fail(400, { message: 'The two new passwords do not match' });
		if (newPassword === currentPassword)
			return fail(400, { message: 'That is the password you already have' });

		try {
			await auth.api.changePassword({
				body: { currentPassword, newPassword, revokeOtherSessions: true },
				headers: request.headers
			});
		} catch (error) {
			return authFailure(error, 'Could not change the password');
		}

		return {
			success: true,
			action: 'changePassword',
			message: 'Password changed. Every other signed-in device was signed out.'
		};
	},

	/** Sign one device out. Its next request finds nothing to authenticate with. */
	revokeSession: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = formData.get('id')?.toString() ?? '';

		try {
			const token = sessionTokenById(buildCtx(locals.user!.id), id);
			await auth.api.revokeSession({ body: { token }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return authFailure(error, 'Could not sign that device out');
			return toActionFailure(error);
		}

		return { success: true, action: 'revokeSession', message: 'That device was signed out.' };
	},

	/**
	 * Sign out everywhere, this browser included.
	 *
	 * Keeping the current session alive would be friendlier and wrong: someone
	 * clicking this has usually decided they do not know who else is logged in,
	 * and the answer to that is nobody.
	 */
	signOutEverywhere: async ({ request }) => {
		try {
			await auth.api.revokeSessions({ headers: request.headers });
		} catch (error) {
			return authFailure(error, 'Could not sign the other devices out');
		}

		redirect(303, '/login');
	},

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
