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
	user: {
		changeEmail: {
			enabled: true,
			/**
			 * Asks the address you are leaving to approve the move.
			 *
			 * The swap does not happen here. Following this link makes
			 * better-auth mail the *new* address, and only that second link
			 * changes anything — so a stolen session cannot walk an account to
			 * an attacker's mailbox without access to both.
			 */
			sendChangeEmailVerification: async ({ user, newEmail, url }) => {
				await sendEmail({
					to: user.email,
					subject: 'Confirm the new address for your ontoplano account',
					text:
						`Someone asked to change this account's address to ${newEmail}.\n\n` +
						`${url}\n\n` +
						`Until you follow that link and confirm the new address, ` +
						`nothing changes and you keep signing in with this one. If this ` +
						`wasn't you, ignore this message and change your password.`
				});
			}
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

/**
 * Does this password belong to this account?
 *
 * better-auth asks for the current password on `changePassword` but not on
 * `changeEmail`, and an email change with a borrowed session is exactly the
 * takeover the second factor is there to stop. There is no public endpoint for
 * "check this password" that does not also mint a session, so this reads the
 * credential account through the auth context and compares hashes.
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
	if (!password) return false;

	const ctx = await auth.$context;
	const accounts = await ctx.internalAdapter.findAccounts(userId);
	const credential = accounts.find((a) => a.providerId === 'credential' && a.password);
	if (!credential?.password) return false;

	return ctx.password.verify({ hash: credential.password, password });
}
