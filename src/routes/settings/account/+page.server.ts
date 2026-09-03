import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth, verifyPassword } from '$lib/server/auth';
import { checkPassword } from '$lib/passwords';
import { loadConfig } from '$lib/server/config';
import { isEmailConfigured } from '$lib/server/email';
import {
	deleteAccount,
	exportAllowance,
	exportsAllowedFor,
	hoursUntil
} from '$lib/server/services/account';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { listSessions, sessionTokenById } from '$lib/server/services/sessions';
import { record } from '$lib/server/services/audit';
import {
	reviewMailHour,
	setWeeklyReviewMail,
	weeklyReviewMailEnabled
} from '$lib/server/services/review-mail';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		email: locals.user!.email,
		emailVerified: locals.user!.emailVerified,
		sessions: listSessions(buildCtx(locals.user!.id), locals.session?.token),
		// Both credential changes are confirmed by mail, so the page says up
		// front when this server has no transport and the link will land in its
		// log instead.
		emailConfigured: isEmailConfigured(),
		// Whether this instance lets an account move to another address at all.
		emailChangeAllowed: loadConfig().account.allowEmailChange,
		weeklyReviewMail: weeklyReviewMailEnabled(locals.user!.id),
		// The hour it would arrive, so the switch says when rather than leaving
		// somebody to find out on a Monday.
		weeklyReviewHour: `${String(reviewMailHour(locals.user!.id)).padStart(2, '0')}:00`,
		exports: (() => {
			const allowance = exportAllowance(locals.user!.id);
			return {
				remaining: allowance.remaining,
				/** So the message can say "two a day" rather than assuming it. */
				allowed: exportsAllowedFor(locals.user!.id),
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
	setWeeklyReviewMail: async ({ request, locals }) => {
		const formData = await request.formData();
		setWeeklyReviewMail(buildCtx(locals.user!.id), formData.get('on') === 'true');
		return { success: true, action: 'setWeeklyReviewMail' };
	},

	/**
	 * Ask to move the account to another address, where the instance allows it.
	 *
	 * Nothing changes here: better-auth mails a confirmation and the swap
	 * happens when the link is followed. The current address stays the one that
	 * signs in until then.
	 */
	changeEmail: async ({ request, locals }) => {
		// The instance decides whether this door exists. Checked here and not only
		// in the page, because a form can be posted without loading one.
		if (!loadConfig().account.allowEmailChange)
			return fail(403, { message: 'This instance does not allow changing your address' });

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

		record(user.id, 'email_change_requested', { detail: { to: newEmail } });

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
	changePassword: async ({ request, locals }) => {
		const formData = await request.formData();
		const currentPassword = formData.get('currentPassword')?.toString() ?? '';
		const newPassword = formData.get('newPassword')?.toString() ?? '';
		const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

		if (!currentPassword || !newPassword) return fail(400, { message: 'Fill in both passwords' });
		const weak = checkPassword(newPassword);
		if (weak) return fail(400, { message: weak });
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

		record(locals.user!.id, 'password_changed');

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
	signOutEverywhere: async ({ request, locals }) => {
		record(locals.user!.id, 'sessions_revoked');

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

		// Recorded before the rows go, because the log goes with them — this is
		// the instance's last note that the account was closed by its owner.
		record(user.id, 'account_deleted');
		deleteAccount(user.id);

		// The session row is gone with the account; clear the cookie so the
		// browser is not carrying a token pointing at nothing.
		for (const name of cookies.getAll().map((c) => c.name)) {
			if (name.startsWith('better-auth')) cookies.delete(name, { path: '/' });
		}

		redirect(303, '/login');
	}
};
