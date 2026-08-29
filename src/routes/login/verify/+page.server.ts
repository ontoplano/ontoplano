import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendVerificationFor } from '$lib/server/auth';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * Signed in, address unconfirmed — the one page such an account can reach
 * while `ONTOPLANO_REQUIRE_VERIFIED_EMAIL=true` (the gate is in
 * hooks.server.ts). It says so plainly and offers exactly one act: sending
 * the mail again.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.emailVerified) redirect(302, '/');
	return { email: locals.user.email };
};

/** One resend a minute, per account — the button counts the same 60 down. */
const RESEND_COOLDOWN_MS = 60 * 1000;

export const actions: Actions = {
	resend: async ({ locals }) => {
		if (!locals.user) redirect(302, '/login');
		if (locals.user.emailVerified) redirect(302, '/');

		const budget = rateLimit(`verify-resend:${locals.user.id}`, 1, RESEND_COOLDOWN_MS);
		if (!budget.allowed) {
			return fail(429, {
				message: `One mail a minute — try again in ${budget.retryAfterSeconds}s.`,
				retryAfterSeconds: budget.retryAfterSeconds
			});
		}

		const { delivered } = await sendVerificationFor(locals.user.email);
		// Undelivered is already a mail_failures row and a /healthz warning;
		// the person still learns the truth instead of watching a spinner.
		return delivered
			? { sent: true, retryAfterSeconds: 60 }
			: fail(502, {
					message:
						'The mail could not be sent just now — the operator has been alerted. Try again in a minute.',
					retryAfterSeconds: 60
				});
	}
};
