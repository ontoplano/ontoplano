import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { sendVerificationFor } from '$lib/server/auth';
import {
	accountById,
	deleteAccountAsAdmin,
	grantTrial,
	requireAdmin,
	setPlanEnd,
	setRole
} from '$lib/server/services/admin';
import { listForSubject, record } from '$lib/server/services/audit';
import { toActionFailure } from '$lib/server/http-errors';
import { isEmailConfigured } from '$lib/server/email';

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAdmin(locals.user!.id);

	return {
		account: accountById(params.id),
		events: listForSubject(params.id),
		emailConfigured: isEmailConfigured(),
		self: locals.user!.id === params.id
	};
};

export const actions: Actions = {
	setRole: async ({ request, locals, params }) => {
		const formData = await request.formData();
		try {
			setRole(locals.user!.id, params.id, formData.get('role'));
			return { success: true, action: 'setRole' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** The operator's clock: end the plan on a chosen date. */
	setPlanEnd: async ({ locals, params, request }) => {
		const formData = await request.formData();
		try {
			setPlanEnd(locals.user!.id, params.id, formData.get('endsAt')?.toString() ?? '');
			return { success: true, action: 'setPlanEnd' };
		} catch (e) {
			return toActionFailure(e);
		}
	},
	/** A trial for an account that predates billing — see grantTrial. */
	grantTrial: async ({ locals, params }) => {
		try {
			grantTrial(locals.user!.id, params.id);
			return { success: true, action: 'grantTrial' };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Send the confirmation link again, for somebody who never got the first. */
	resendVerification: async ({ locals, params }) => {
		requireAdmin(locals.user!.id);

		try {
			const account = accountById(params.id);
			const { delivered, url } = await sendVerificationFor(account.email);

			record(params.id, 'verification_resent', { actorId: locals.user!.id });

			// With no mail server there is nothing to announce as sent. Hand the
			// administrator the link instead, so they can pass it on themselves.
			return {
				success: true,
				action: 'resendVerification',
				message: delivered
					? `Confirmation email sent to ${account.email}.`
					: `Nothing was emailed — this instance has no mail server. Send ${account.email} this link yourself; it confirms their address.`,
				link: delivered ? null : url
			};
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message });
			return toActionFailure(e);
		}
	},

	/**
	 * Erase the account, having been made to type its address.
	 *
	 * A redirect on success rather than a form message: the page this action
	 * belongs to is about an account that no longer exists, and re-rendering it
	 * would be a 404 or, worse, a cached shell of somebody who is gone.
	 */
	deleteAccount: async ({ locals, params, request }) => {
		const formData = await request.formData();
		try {
			deleteAccountAsAdmin(locals.user!.id, params.id, formData.get('confirmEmail'));
		} catch (e) {
			return toActionFailure(e);
		}
		redirect(303, '/admin?deleted=1');
	}
};
