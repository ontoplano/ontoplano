import { betterAuth } from 'better-auth/minimal';
import { createEmailVerificationToken } from 'better-auth/api';
import { admin } from 'better-auth/plugins/admin';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { building } from '$app/environment';
import { db } from '$lib/server/db';
import { MIN_PASSWORD_LENGTH } from '$lib/passwords';
import { sendLogged } from '$lib/server/services/mail-log';
import { renderEmail } from '$lib/server/email-template';
import { familyInviteMail, takeFamilyInvite } from '$lib/server/services/family-invite';

const verificationMail = (url: string) =>
	renderEmail({
		subject: 'Confirm your ontoplano address',
		lines: ['Confirm this address belongs to you.'],
		action: { label: 'Confirm address', url },
		small: ["If you didn't create an ontoplano account, ignore this message."]
	});

/**
 * Verification is asked for but never blocks the sign-in itself.
 *
 * When `ONTOPLANO_REQUIRE_VERIFIED_EMAIL=true`, the gate lives in
 * hooks.server.ts instead of here: the person signs IN, and everything they
 * reach is the page that says the address is unverified, with a resend
 * button. better-auth's own hard gate would answer the login form with an
 * error and strand them outside — no session, no resend, nothing to do but
 * dig through a mailbox for a link that may never have arrived.
 */

/**
 * A secret for the build, which signs nothing.
 *
 * better-auth is constructed when this module is imported, and it refuses to
 * exist without a secret — correctly: a server running on the default one has
 * sessions anybody can forge. But a *build* imports this module too, while
 * rendering, and a build has no environment and needs none. So `yarn build`
 * inside a container, or on a fresh clone with no `.env`, died at "rendering
 * chunks" with a BetterAuthError about the default secret, which reads like a
 * misconfigured deployment and is a build with nothing configured at all.
 *
 * `building` is SvelteKit's own flag and is false in every running process, so
 * this cannot become a deployment's secret: a server started without one still
 * gets the same refusal it gets today, which is the behaviour that matters.
 * Nothing is signed, verified or written during a build, and the value never
 * reaches the output — `$env/dynamic/private` is read at runtime, not inlined.
 */
const secret = env.BETTER_AUTH_SECRET || (building ? 'build-only-secret-signs-nothing' : undefined);

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	/*
	 * An address and a password, and nothing else.
	 *
	 * Signing in with Google or GitHub was offered here and is deliberately
	 * gone. An account on somebody's own instance should not depend on a company
	 * neither of us controls: the provider learns every instance a person signs
	 * into, an account survives only as long as they keep that account, and a
	 * self-hosted app whose door is somebody else's service is not really
	 * self-hosted. There is no `socialProviders` key, so there is nothing to
	 * turn on by setting a variable either.
	 */
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		/*
		 * Eight characters, and not all of one kind.
		 *
		 * Deliberately modest: length is what actually matters and rules that
		 * demand an uppercase and a symbol mostly produce `Password1!`. This is
		 * the floor that stops `123456` and `qwerty`, and nothing beyond it —
		 * the rest of the defence is the rate limit on the sign-in door.
		 *
		 * The length is better-auth's business; "not all of one kind" is
		 * `$lib/passwords`, which every door that takes a new password calls.
		 * The form says the rule up front so nobody meets it only as a refusal.
		 */
		minPasswordLength: MIN_PASSWORD_LENGTH,
		// Short-lived, because a reset link in a mailbox is a standing key to the
		// account.
		resetPasswordTokenExpiresIn: 60 * 60,
		sendResetPassword: async ({ user, url }) => {
			await sendLogged('password-reset', {
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
				await sendLogged('address-change', {
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
			/*
			 * The same link, a different letter. An account made by a family
			 * invitation gets the invitation — "X is paying for an account for
			 * you" — because "confirm the address you registered with" is a
			 * sentence about something they never did. The link still verifies,
			 * still signs them in, still lands on /welcome.
			 */
			const invite = takeFamilyInvite(user.email);
			if (invite) {
				await sendLogged('family-invite', {
					to: user.email,
					...familyInviteMail(url, invite.ownerName)
				});
				return;
			}
			await sendLogged('verification', {
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
	/*
	 * Back to the verify page, not to the app.
	 *
	 * `callbackURL` was `/`, so following the link in the mail landed somebody
	 * straight inside — past the one page that decides what comes next. On an
	 * instance that sells, the next step after confirming an address is the
	 * card, and `/login/verify` is what knows that; going round it skipped the
	 * whole billing step of registration and let somebody in for free.
	 *
	 * It is idempotent: an already-verified visitor is redirected onwards by
	 * that page the moment it loads, so nobody sees it twice.
	 */
	const url = `${ctx.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent('/login/verify')}`;

	const { delivered } = await sendLogged('verification', {
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
