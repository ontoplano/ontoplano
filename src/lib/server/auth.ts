import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendEmail } from '$lib/server/email';

/**
 * Verification is asked for but not enforced.
 *
 * Requiring a verified address before sign-in would lock out every existing
 * account the moment this shipped, and would make the app unusable on a
 * self-hosted install with no SMTP. So the mail goes out and the banner nags;
 * turning it into a hard gate is a deployment decision, not a default.
 */
const REQUIRE_VERIFIED_EMAIL = process.env.ONTOPLANO_REQUIRE_VERIFIED_EMAIL === 'true';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: REQUIRE_VERIFIED_EMAIL,
		// Short-lived, because a reset link in a mailbox is a standing key to the
		// account.
		resetPasswordTokenExpiresIn: 60 * 60,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Reset your ontoplano password',
				text:
					`Someone asked to reset the password for this ontoplano account.\n\n` +
					`${url}\n\n` +
					`The link works once and expires in an hour. If this wasn't you, ` +
					`nothing has changed and you can ignore this message.`
			});
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Confirm your ontoplano address',
				text: `Confirm this address belongs to you:\n\n${url}\n`
			});
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
