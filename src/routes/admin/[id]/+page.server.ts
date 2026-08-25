import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { accountById, requireAdmin, setRole } from '$lib/server/services/admin';
import { listForSubject, record } from '$lib/server/services/audit';
import { toActionFailure } from '$lib/server/services/errors';
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

	/** Send the confirmation link again, for somebody who never got the first. */
	resendVerification: async ({ locals, params, request }) => {
		requireAdmin(locals.user!.id);

		try {
			const account = accountById(params.id);
			await auth.api.sendVerificationEmail({
				body: { email: account.email },
				headers: request.headers
			});

			record(params.id, 'verification_resent', { actorId: locals.user!.id });

			return {
				success: true,
				action: 'resendVerification',
				message: isEmailConfigured()
					? `Sent again to ${account.email}.`
					: 'This server has no mail configured, so the link went to its log.'
			};
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message });
			return toActionFailure(e);
		}
	},

	/**
	 * Sign in as somebody else, with the session marked as borrowed.
	 *
	 * Recorded against both accounts before it happens: the point of the log is
	 * that the person whose account it is can see it too.
	 */
	impersonate: async ({ locals, params, request }) => {
		requireAdmin(locals.user!.id);

		if (locals.user!.id === params.id) return fail(400, { message: 'That is already you' });

		try {
			await auth.api.impersonateUser({
				body: { userId: params.id },
				headers: request.headers
			});
		} catch (e) {
			if (e instanceof APIError) return fail(400, { message: e.message });
			return toActionFailure(e);
		}

		record(params.id, 'impersonation_started', { actorId: locals.user!.id });
		redirect(303, '/');
	}
};
