import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { user } from '../db/auth.schema.js';
import { planMembers } from '../db/schema.js';
import { loadConfig } from '../config.js';
import { renderEmail } from '../email-template.js';
import { checkPassword } from '../../passwords.js';
import { getUserSetting, setUserSetting } from '../settings.js';
import { record } from './audit.js';
import { ValidationError } from './errors.js';
import { sendLogged } from './mail-log.js';
import { addToPlan, membersOf, resolvePlan, seatsFor } from './subscriptions.js';

/**
 * Inviting somebody to the plan, and the account that makes for them.
 *
 * An address with no account gets one made on the spot — with a password
 * nobody knows — and a mail whose link verifies the address, signs the new
 * account in and lands it on the set-password step. The link is better-auth's
 * ordinary verification URL, minted directly (`familyInviteLinkFor` in
 * auth.ts), so there is no second token system.
 */

const PASSWORD_PENDING_KEY = 'account.passwordPending';

/**
 * Whether this account has never chosen a password.
 *
 * True only for accounts minted by a family invitation, from creation until
 * the set-password step (or a password reset) replaces the random one. The
 * /welcome funnel reads it to put the password page first.
 */
export function passwordPending(userId: string): boolean {
	return getUserSetting(userId, PASSWORD_PENDING_KEY) === 'true';
}

export function markPasswordPending(userId: string): void {
	setUserSetting(userId, PASSWORD_PENDING_KEY, 'true');
}

/**
 * The invited account's first password, chosen on the page the mail opens.
 *
 * Hashed and stored the way better-auth stores every credential, so the next
 * sign-in is an ordinary sign-in. Clears the pending flag, which is what lets
 * /welcome proceed.
 */
export async function chooseFirstPassword(userId: string, password: unknown): Promise<void> {
	const said = typeof password === 'string' ? password : '';
	const wrong = checkPassword(said);
	if (wrong) throw new ValidationError(wrong);

	const { auth } = await import('../auth.js');
	const authCtx = await auth.$context;
	await authCtx.internalAdapter.updatePassword(userId, await authCtx.password.hash(said));

	setUserSetting(userId, PASSWORD_PENDING_KEY, 'false');
}

export function familyInviteMail(url: string, ownerName: string) {
	return renderEmail({
		subject: `${ownerName} added you to their ontoplano plan`,
		lines: [
			`${ownerName} is paying for an ontoplano account for you. It is already made — the button below opens it and asks you to choose your password.`,
			'Your notes and your week are your own; the only thing shared is the invoice.'
		],
		action: { label: 'Open your account', url },
		small: ['If you were not expecting this, ignore it and nothing happens.']
	});
}

/**
 * Put somebody on the plan whether or not they have an account yet.
 *
 * With an account, this is `addToPlan` — the seat lands instantly. Without
 * one, the account is made on the spot with a password nobody knows, the seat
 * attached, and the invitation mail carries better-auth's own verification
 * link — which verifies the address, signs the new account in and lands it on
 * the set-password page, and /welcome after that. No second token system; the
 * one the funnel already has.
 *
 * Creation is only offered where registration is open. On an invite-only or
 * closed instance a payer typing addresses must not be a way to mint
 * accounts, so those fall back to the old rule: the account has to exist.
 */
export async function inviteToPlan(
	ownerId: string,
	email: string
): Promise<{ id: string; name: string; invited: boolean }> {
	const wanted = String(email ?? '')
		.trim()
		.toLowerCase();

	const existing = db.select().from(user).where(eq(user.email, wanted)).get();
	if (existing) return { ...addToPlan(ownerId, wanted), invited: false };

	// The seat checks, before an account is made for a plan with no room.
	const owner = resolvePlan(ownerId);
	if (owner.plan === 'none') throw new ValidationError('This plan is not active');
	const seats = seatsFor(ownerId);
	if (seats <= 1) throw new ValidationError('This plan covers one account');
	if (membersOf(ownerId).length >= seats - 1) {
		throw new ValidationError(`This plan covers ${seats} accounts, and they are all taken`);
	}
	if (!wanted || !wanted.includes('@')) throw new ValidationError('An email address is needed');

	if (loadConfig().registration.mode !== 'open') {
		// The message an existing-but-taken address gets, on purpose: a closed
		// instance does not confirm which addresses have accounts either way.
		throw new ValidationError('No account here uses that address');
	}

	const payer = db.select({ name: user.name }).from(user).where(eq(user.id, ownerId)).get();

	/*
	 * Imported here, not at the top: auth.ts reaches for `$env` and
	 * `$app/server`, which only exist inside a Vite build, and this module has
	 * to stay loadable outside one — see tests/billing-outside-vite.test.ts.
	 */
	const { auth, familyInviteLinkFor } = await import('../auth.js');
	const authCtx = await auth.$context;

	/*
	 * Through the internal adapter, NOT `auth.api.signUpEmail`. The sign-up
	 * endpoint mints a session for the account it creates, and the sveltekit
	 * cookie hook writes that session onto the response of whoever made the
	 * request — which here is the payer, who found themselves signed in as the
	 * brand-new unverified member and bounced to the verify wall. Nobody is
	 * signing in; an account is being made for a mail to open.
	 */
	const created = await authCtx.internalAdapter.createUser({
		email: wanted,
		// Their name until they pick one: the part of the address before the @.
		name: wanted.split('@')[0],
		emailVerified: false
	});
	await authCtx.internalAdapter.linkAccount({
		userId: created.id,
		providerId: 'credential',
		accountId: created.id,
		// A password nobody knows; the set-password step replaces it.
		password: await authCtx.password.hash(randomBytes(24).toString('base64url'))
	});
	const memberId = created.id;
	markPasswordPending(memberId);

	db.insert(planMembers).values({ ownerId, memberId }).run();
	record(ownerId, 'seat_added', { detail: { member: memberId, invited: true } });

	// Delivery is not the transaction: the seat exists either way, the failure
	// lands in the mail log with its alert, and /admin can resend the link.
	const url = await familyInviteLinkFor(wanted);
	await sendLogged('family-invite', {
		to: wanted,
		...familyInviteMail(url, payer?.name ?? 'Somebody')
	});

	return { id: memberId, name: wanted, invited: true };
}
