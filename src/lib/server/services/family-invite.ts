import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { user } from '../db/auth.schema.js';
import { planMembers } from '../db/schema.js';
import { loadConfig } from '../config.js';
import { renderEmail } from '../email-template.js';
import { record } from './audit.js';
import { ValidationError } from './errors.js';
import { addToPlan, membersOf, resolvePlan, seatsFor } from './subscriptions.js';

/**
 * The handshake between "invite somebody to the plan" and the mail that goes out.
 *
 * Inviting an address with no account creates the account, and better-auth
 * insists on mailing every new account its verification link — which is the
 * right mail for somebody who registered and the wrong one for somebody whose
 * partner just added them. This map is how `sendVerificationEmail` knows which
 * is which: the invite registers the address here for the duration of the
 * sign-up call, and the sender swaps the letter, keeping the same link.
 *
 * The link itself is better-auth's ordinary verification URL, which verifies
 * the address, signs the new account in, and lands it on /welcome — three
 * things this module would otherwise need a token table to do.
 */
const pending = new Map<string, { ownerName: string }>();

export function expectFamilyInvite(email: string, ownerName: string): void {
	pending.set(email.toLowerCase(), { ownerName });
}

/** One look, and the entry is gone — the ordinary mail returns for a resend. */
export function takeFamilyInvite(email: string): { ownerName: string } | null {
	const key = email.toLowerCase();
	const entry = pending.get(key) ?? null;
	pending.delete(key);
	return entry;
}

export function familyInviteMail(url: string, ownerName: string) {
	return renderEmail({
		subject: `${ownerName} added you to their ontoplano plan`,
		lines: [
			`${ownerName} is paying for an ontoplano account for you. It is already made — the button below opens it.`,
			'Your notes and your week are your own; the only thing shared is the invoice.'
		],
		action: { label: 'Open your account', url },
		small: [
			'To pick a password later, use “Forgot password” on the sign-in page.',
			'If you were not expecting this, ignore it and nothing happens.'
		]
	});
}

/**
 * Put somebody on the plan whether or not they have an account yet.
 *
 * With an account, this is `addToPlan` — the seat lands instantly. Without
 * one, the account is made on the spot with a password nobody knows, the seat
 * attached, and the invitation mail carries better-auth's own verification
 * link — which verifies the address, signs the new account in and lands it on
 * /welcome. No second token system; the one the funnel already has.
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
	expectFamilyInvite(wanted, payer?.name ?? 'Somebody');

	/*
	 * Imported here, not at the top, for two reasons that point the same way:
	 * auth.ts reaches for `$env` and `$app/server`, which only exist inside a
	 * Vite build, and auth.ts imports THIS module for the letter swap — a
	 * static import back would be a cycle. This whole module stays out of the
	 * graph the box's scheduled jobs load under tsx; see
	 * tests/billing-outside-vite.test.ts and scripts/check-job-deps.mjs.
	 */
	const { auth } = await import('../auth.js');

	// Their name until they pick one: the part of the address before the @.
	let memberId: string | undefined;
	try {
		const created = await auth.api.signUpEmail({
			body: {
				email: wanted,
				password: randomBytes(24).toString('base64url'),
				name: wanted.split('@')[0],
				callbackURL: '/welcome'
			}
		});
		memberId = created?.user?.id;
	} catch (e) {
		/*
		 * The cookie after-hook throws outside a request — a unit test, a
		 * script — after the account and the mail are already done. Anything
		 * that failed that late must not strand an account with no seat, so
		 * the answer is whether the row exists, not whether the call returned.
		 */
		memberId = db.select({ id: user.id }).from(user).where(eq(user.email, wanted)).get()?.id;
		if (!memberId) throw e;
	}
	if (!memberId) throw new ValidationError('The account could not be created');

	db.insert(planMembers).values({ ownerId, memberId }).run();
	record(ownerId, 'seat_added', { detail: { member: memberId, invited: true } });

	return { id: memberId, name: wanted, invited: true };
}
