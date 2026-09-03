import { randomBytes } from 'node:crypto';
import { eq, isNotNull, isNull, and } from 'drizzle-orm';

import { db } from '../db/index.js';
import { subscribers } from '../db/schema.js';
import { renderEmail } from '../email-template.js';
import { loadConfig } from '../config.js';
import { sendLogged } from './mail-log.js';
import { ValidationError } from './errors.js';

/**
 * The one channel nobody else can take away.
 *
 * Every other way of reaching somebody who liked this is rented. A subreddit
 * changes its rules, a feed changes its ranking, a search position moves, and
 * the audience that took a year to gather is gone in an afternoon. An address
 * somebody handed over is not like that.
 *
 * It is also the only way to tell the hundred people who tried the demo and did
 * not sign up that the thing they wanted now exists.
 *
 * ## Not accounts
 *
 * A subscriber is an address, a flag, and a token. No password, no session, no
 * join to `user`. Somebody who subscribed and later signed up is two unrelated
 * facts, and keeping them unrelated is what stops "unsubscribe" from ever being
 * confused with "delete my account".
 *
 * ## Double opt-in, and what that buys
 *
 * A row is created unconfirmed. Nothing is ever sent to it but the one
 * confirmation, and if the link is never followed the row stays a dead address
 * that costs nothing. So typing somebody else's address into the form
 * subscribes nobody, which is both the law here and in the EU and the reason a
 * list is worth having: everyone on it asked twice.
 *
 * The confirmation token is *not* cleared afterwards, because it is also what
 * the unsubscribe link in every issue carries. A way in that becomes no way out
 * is precisely how a domain gets filed as spam.
 *
 * ## What it never says
 *
 * Subscribing answers the same thing whether the address was new, already
 * confirmed, or previously unsubscribed. The form must not be a way to ask
 * "is this person on your list", which it would be the moment the answers
 * differed.
 */

/** Long enough that a token cannot be guessed, short enough to sit in a URL. */
const TOKEN_BYTES = 24;

/** RFC-shaped enough to catch a typo; the confirmation catches the rest. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export type Subscriber = {
	email: string;
	confirmed: boolean;
	createdAt: string;
};

/** Whether this instance keeps a list at all. */
export function newsletterEnabled(): boolean {
	return loadConfig().newsletter.enabled;
}

/** The one other origin allowed to post the form, if there is one. */
export function newsletterOrigin(): string {
	return loadConfig().newsletter.origin;
}

function origin(): string {
	return process.env.ORIGIN ?? '';
}

function normalise(raw: unknown): string {
	const email = String(raw ?? '')
		.trim()
		.toLowerCase();
	if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) {
		throw new ValidationError('That does not look like an email address.');
	}
	return email;
}

/**
 * Take an address, and send exactly one confirmation to it.
 *
 * Answers `true` whatever happened, because the caller is a public form and
 * the difference between "new" and "already on the list" is not the form's to
 * disclose. A send that fails is a mail-log row like any other; the person is
 * told the same thing either way, because "check your inbox" is true and
 * "our SMTP is down" is not their problem to act on.
 */
export async function subscribe(rawEmail: unknown, source = 'site'): Promise<void> {
	if (!newsletterEnabled()) throw new ValidationError('Not available here.');

	const email = normalise(rawEmail);
	const existing = db.select().from(subscribers).where(eq(subscribers.email, email)).get();

	// Already confirmed and still on the list: nothing to do, and above all no
	// second mail. Somebody hammering the form must not be able to use it to
	// send mail to an address that did not ask for any.
	if (existing?.confirmedAt && !existing.unsubscribedAt) return;

	let token: string;
	if (existing) {
		token = existing.token;
		// Coming back after unsubscribing is subscribing again, which means
		// confirming again — the earlier consent was withdrawn.
		db.update(subscribers)
			.set({ unsubscribedAt: null, confirmedAt: null })
			.where(eq(subscribers.id, existing.id))
			.run();
	} else {
		token = randomBytes(TOKEN_BYTES).toString('base64url');
		db.insert(subscribers).values({ email, token, source }).run();
	}

	const confirm = origin() ? `${origin()}/newsletter/confirm?t=${token}` : '';

	await sendLogged(
		'newsletter-confirm',
		{
			to: email,
			...renderEmail({
				subject: 'Confirm your ontoplano subscription',
				lines: [
					'Somebody asked to be told when ontoplano changes, using this address.',
					'If that was you, confirm it below. Nothing is sent until you do.'
				],
				action: confirm ? { label: 'Yes, tell me', url: confirm } : undefined,
				small: [
					"If it wasn't you, ignore this message — the address is not on any list " +
						'until this link is followed, and you will hear nothing more.'
				]
			})
		},
		// Worth retrying from /admin: unlike a password reset, this link does not
		// expire, so the same mail is still the right mail tomorrow.
		{ retryable: true }
	);
}

/** Follow the link. Answers the address, or null if the token is not one. */
export function confirm(token: unknown): string | null {
	const value = String(token ?? '');
	if (!value) return null;

	const row = db.select().from(subscribers).where(eq(subscribers.token, value)).get();
	if (!row) return null;

	// Idempotent: a link followed twice, or prefetched by a mail client and
	// then clicked, must not undo itself.
	if (!row.confirmedAt || row.unsubscribedAt) {
		db.update(subscribers)
			.set({ confirmedAt: new Date().toISOString(), unsubscribedAt: null })
			.where(eq(subscribers.id, row.id))
			.run();
	}

	return row.email;
}

/**
 * Come off the list.
 *
 * Kept as a row with a date rather than deleted, so that a later subscribe
 * knows to ask again instead of quietly resuming — and so the same link
 * followed twice says the same thing.
 */
export function unsubscribe(token: unknown): string | null {
	const value = String(token ?? '');
	if (!value) return null;

	const row = db.select().from(subscribers).where(eq(subscribers.token, value)).get();
	if (!row) return null;

	if (!row.unsubscribedAt) {
		db.update(subscribers)
			.set({ unsubscribedAt: new Date().toISOString() })
			.where(eq(subscribers.id, row.id))
			.run();
	}

	return row.email;
}

/** How many are actually on the list, and how many have not answered yet. */
export function counts(): { confirmed: number; pending: number } {
	const confirmed = db
		.select()
		.from(subscribers)
		.where(and(isNotNull(subscribers.confirmedAt), isNull(subscribers.unsubscribedAt)))
		.all().length;

	const pending = db
		.select()
		.from(subscribers)
		.where(and(isNull(subscribers.confirmedAt), isNull(subscribers.unsubscribedAt)))
		.all().length;

	return { confirmed, pending };
}

/**
 * The list, for the one person who runs this instance.
 *
 * Confirmed and not unsubscribed, and nothing else — the point of an export is
 * that it can be pasted into whatever sends the issue, and a list that included
 * people who never confirmed would be the thing that gets that sender banned.
 */
export function confirmedAddresses(): string[] {
	return db
		.select({ email: subscribers.email })
		.from(subscribers)
		.where(and(isNotNull(subscribers.confirmedAt), isNull(subscribers.unsubscribedAt)))
		.all()
		.map((row) => row.email);
}
