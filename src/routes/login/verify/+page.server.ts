import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sendVerificationFor } from '$lib/server/auth';
import { rateLimit, rateLimitWait } from '$lib/server/rate-limit';
import { paymentHoldFor } from '$lib/server/services/access';

/**
 * Signed in, address unconfirmed — the one page such an account can reach
 * while `ONTOPLANO_REQUIRE_VERIFIED_EMAIL=true` (the gate is in
 * hooks.server.ts). It says so plainly and offers exactly one act: sending
 * the mail again.
 */
/**
 * Where somebody goes once the address *is* confirmed.
 *
 * The card comes after the address, so this has to know whether there is a card
 * step waiting — landing on the dashboard would only have the billing gate
 * bounce them straight out of it again.
 *
 * It no longer serves a "skip for now" link. That link led back here on any
 * instance that requires confirmation, which is every instance that shows this
 * page, so it read as the app being broken on the first screen somebody sees.
 */
function onwards(userId: string): string {
	return paymentHoldFor(userId) === 'billing' ? '/start' : '/';
}

/** One resend a minute, per account — the button counts the same 60 down. */
const RESEND_COOLDOWN_MS = 60 * 1000;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.emailVerified) redirect(302, onwards(locals.user.id));
	return {
		email: locals.user.email,
		// The wait already owed, so the button opens counting instead of
		// inviting a click the action would refuse: registration sent the mail
		// seconds ago and seeded this same bucket.
		retryAfterSeconds: rateLimitWait(`verify-resend:${locals.user.id}`, 1)
	};
};

export const actions: Actions = {
	resend: async ({ locals }) => {
		if (!locals.user) redirect(302, '/login');
		if (locals.user.emailVerified) redirect(302, onwards(locals.user.id));

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
