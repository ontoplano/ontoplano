import { betterAuth } from 'better-auth/minimal';
import { createEmailVerificationToken } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { sendEmail } from '$lib/server/email';
import { renderEmail } from '$lib/server/email-template';
import { configuredProviders, type SocialProvider } from '$lib/social';

const verificationMail = (url: string) =>
	renderEmail({
		subject: 'Confirm your ontoplano address',
		lines: ['Confirm this address belongs to you.'],
		action: { label: 'Confirm address', url },
		small: ["If you didn't create an ontoplano account, ignore this message."]
	});

/**
 * Verification is asked for but not enforced.
 *
 * Requiring a verified address before sign-in would lock out every existing
 * account the moment this shipped, and would make the app unusable on a
 * self-hosted install with no SMTP. So the mail goes out and the banner nags;
 * turning it into a hard gate is a deployment decision, not a default.
 */
const REQUIRE_VERIFIED_EMAIL = process.env.ONTOPLANO_REQUIRE_VERIFIED_EMAIL === 'true';

/**
 * Which social sign-ins this instance actually has credentials for.
 *
 * A button that opens a provider and comes back with "invalid client" is worse
 * than no button, so an instance offers exactly what it is configured for and
 * nothing else. Apple and X are deliberately absent: Apple needs a paid
 * developer account and a client secret that has to be re-signed twice a year,
 * and X's OAuth now sits behind their paid API tiers. Both are a day's work
 * with an ongoing cost; Google and GitHub are ten minutes each and free.
 */
export function configuredSocialProviders(): SocialProvider[] {
	return configuredProviders(process.env);
}

function socialProviderConfig() {
	const config: Record<string, { clientId: string; clientSecret: string }> = {};

	for (const id of configuredSocialProviders()) {
		config[id] = {
			clientId: process.env[`${id.toUpperCase()}_CLIENT_ID`]!,
			clientSecret: process.env[`${id.toUpperCase()}_CLIENT_SECRET`]!
		};
	}

	return config;
}

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	socialProviders: socialProviderConfig(),
	account: {
		accountLinking: {
			/**
			 * Same address, same account.
			 *
			 * Somebody who signed up with a password and later presses "Sign in with
			 * Google" on the same address means to get into their own account, not to
			 * make a second one. Only enabled for providers that verify the address
			 * themselves, which both of these do — otherwise it is a way to claim
			 * somebody's account by asserting their email.
			 */
			enabled: true,
			trustedProviders: ['google', 'github']
		}
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: REQUIRE_VERIFIED_EMAIL,
		// Short-lived, because a reset link in a mailbox is a standing key to the
		// account.
		resetPasswordTokenExpiresIn: 60 * 60,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				...renderEmail({
					subject: 'Reset your ontoplano password',
					lines: ['Someone asked to reset the password for this ontoplano account.'],
					action: { label: 'Choose a new password', url },
					small: [
						"The link works once and expires in an hour. If this wasn't you, " +
							'nothing has changed and you can ignore this message.'
					]
				})
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
					...renderEmail({
						subject: 'Confirm the new address for your ontoplano account',
						lines: [`Someone asked to change this account's address to ${newEmail}.`],
						action: { label: 'Approve the change', url },
						small: [
							'Until you follow that link and confirm the new address, nothing ' +
								'changes and you keep signing in with this one. If this ' +
								"wasn't you, ignore this message and change your password."
						]
					})
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
				...verificationMail(url)
			});
		}
	},
	/**
	 * Roles and impersonation come from better-auth rather than from here.
	 *
	 * Borrowing somebody's session safely — a real session row, marked as
	 * borrowed, with its own short expiry and a way back — is easy to write and
	 * easy to get subtly wrong. The plugin already does it, and marks the
	 * session so the app can say so in a banner.
	 */
	plugins: [
		admin({
			defaultRole: 'member',
			adminRoles: ['admin'],
			// An hour is long enough to see what somebody is seeing and short
			// enough that a forgotten tab is not a standing key to their diary.
			impersonationSessionDuration: 60 * 60
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

/**
 * Ask an account to confirm its address, on somebody else's behalf.
 *
 * `auth.api.sendVerificationEmail` refuses outright when a session is present
 * whose address is not the one being verified — "Email mismatch" — which is
 * every time an administrator resends somebody else's link. So the token is
 * minted here, exactly as sign-up mints it, and the same message goes out.
 *
 * The URL comes back either way: with no mail server there is nothing to
 * announce as sent, and an administrator holding the link can pass it on.
 */
export async function sendVerificationFor(email: string): Promise<{
	delivered: boolean;
	url: string;
}> {
	const ctx = await auth.$context;
	const token = await createEmailVerificationToken(
		ctx.secret,
		email,
		undefined,
		ctx.options.emailVerification?.expiresIn
	);
	const url = `${ctx.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent('/')}`;

	const { delivered } = await sendEmail({
		to: email,
		...verificationMail(url)
	});

	return { delivered, url };
}

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
