import { randomBytes } from 'node:crypto';
import { eq, isNotNull, isNull, and } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { newsletterIssues, subscribers } from '$lib/db/schema.js';
import { renderEmail } from '../email-template.js';
import { loadConfig } from '../config.js';
import { sendLogged } from './mail-log.js';
import { ValidationError } from '$lib/services/errors.js';
import { translatorFor } from '$lib/i18n/core';
import { localeForAddress } from '$lib/server/locale';

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
 * ## One step, and what stands in for the second
 *
 * An address is on the list the moment somebody types it and presses the
 * button. Double opt-in is the safer arrangement and this deliberately is not
 * it: a confirming click loses the people who do not go back to their mail.
 *
 * A welcome note still goes out, and it is not that click. It asks for
 * nothing; it says the address is on the list, says what will arrive, and
 * carries the way off. Somebody who has handed over an address and been shown
 * a sentence on a web page has no other evidence the thing worked, and an
 * address typed by mistake — or by somebody else — has nowhere to complain to
 * until a message arrives at it.
 *
 * What stands in its place is the part that actually protects a domain: a hard
 * rate limit in front of the endpoint, and an unsubscribe link in every single
 * message — one click, nobody signed in to anything.
 *
 * Every row still carries a token, because that link is what it carries.
 *
 * ## What it never says
 *
 * Subscribing answers the same thing whether the address was new, already
 * confirmed, or previously unsubscribed. The form must not be a way to ask
 * "is this person on your list", which it would be the moment the answers
 * differed.
 */

/**
 * What the form says when it has worked.
 *
 * Here rather than in the route, beside the code that decides what actually
 * happens: the sentence went on saying "check your inbox — there is one link
 * to follow" for a while after the confirming mail stopped being sent, and a
 * promise kept in a different file from the thing it promises is how that
 * happens. `tests/newsletter.test.ts` holds it to what `subscribe` does.
 */
export const SUBSCRIBE_ACCEPTED = "You're on the list.";

/** Long enough that a token cannot be guessed, short enough to sit in a URL. */
const TOKEN_BYTES = 24;

/** RFC-shaped enough to catch a typo, which is all a form can do for one. */
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
 * Take an address, and put it on the list.
 *
 * Answers the same whatever happened, because the caller is a public form and
 * the difference between "new" and "already on the list" is not the form's to
 * disclose. Mail follows the same rule: a welcome goes to an address that has
 * just joined and to nothing else, so the form cannot be used to send anything
 * to an address that did not ask for it twice.
 *
 * The send is after the write and cannot undo it. A subscriber whose welcome
 * bounced is subscribed — the list is the row — and the failure belongs in the
 * mail log where the operator sees it, not in an answer to a stranger.
 */
export async function subscribe(rawEmail: unknown, source = 'site'): Promise<void> {
	if (!newsletterEnabled()) throw new ValidationError('Not available here.');

	const email = normalise(rawEmail);
	const existing = db.select().from(subscribers).where(eq(subscribers.email, email)).get();

	// Already on the list: nothing to do, and above all no mail. Somebody
	// hammering the form must not be able to use it to send anything to an
	// address that did not ask.
	if (existing?.confirmedAt && !existing.unsubscribedAt) return;

	/*
	 * On the list at once, rather than after a confirming click.
	 *
	 * Double opt-in is the safer arrangement and this deliberately is not it:
	 * somebody who typed an address and pressed the button has said what they
	 * want, and a second step to prove it loses the people who do not go back
	 * to their mail. What that costs is the guarantee that the address belongs
	 * to whoever typed it — so what stands in its place is the part that
	 * actually protects a domain: a hard rate limit in front of this, and an
	 * unsubscribe link in every single message, which is one click and needs
	 * nobody to be signed in to anything.
	 */
	const now = new Date().toISOString();
	if (existing) {
		db.update(subscribers)
			.set({ unsubscribedAt: null, confirmedAt: now })
			.where(eq(subscribers.id, existing.id))
			.run();
	} else {
		db.insert(subscribers)
			.values({
				email,
				token: randomBytes(TOKEN_BYTES).toString('base64url'),
				source,
				confirmedAt: now
			})
			.run();
	}

	await welcome(email);
}

/**
 * The one message that is not a release.
 *
 * Built like an issue — the same rendering, the same way off at the foot, the
 * subscriber's own language where they have an account here — because it is
 * the same list and should not arrive looking like something else.
 */
async function welcome(email: string): Promise<void> {
	const where = origin();
	const stop = where ? `${where}/newsletter/off?t=${tokenFor(email)}` : '';
	const t = await translatorFor(localeForAddress(email));

	try {
		await sendLogged(
			'newsletter-welcome',
			{
				to: email,
				...renderEmail({
					subject: t('mail.newsletterWelcome.subject'),
					lines: [t('mail.newsletterWelcome.line1'), t('mail.newsletterWelcome.line2')],
					action: where ? { label: t('mail.newsletterWelcome.action'), url: where } : undefined,
					small: stop ? [t('mail.stopThese', { url: stop })] : []
				})
			},
			// Re-sendable: nothing in it expires, so an operator clearing a
			// failure can send the same words rather than nothing.
			{ retryable: true }
		);
	} catch {
		// The row is written and the person is subscribed. What went wrong with
		// the sending is the mail log's business — see `sendLogged`.
	}
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

/**
 * Whether this version has already been announced.
 *
 * The release runs from a make target that is meant to be re-runnable — a
 * publish that died at step six is started again — and the one step nobody
 * wants repeated is the one that reaches two hundred inboxes.
 */
export function announced(version: string): boolean {
	return !!db
		.select({ id: newsletterIssues.id })
		.from(newsletterIssues)
		.where(eq(newsletterIssues.version, version))
		.get();
}

export type Issue = { version: string; subject: string; lines: string[] };

/**
 * Tell the list that something shipped.
 *
 * One message per address, each carrying that person's own unsubscribe link —
 * which is the whole of what keeps this from being the thing mailbox providers
 * exist to stop. Sent one at a time rather than as one message to everybody,
 * because a single mail with two hundred addresses on it discloses the list to
 * every one of them.
 *
 * A failure is counted and the rest go on: an address that bounces is that
 * address's problem, and stopping the run at the first one would mean the
 * hundred after it never hear. The failures are retryable from /admin, the
 * same as every other mail this app sends, and the count is written down so a
 * partial send is a visible fact rather than something to infer.
 *
 * Refuses to send twice. Say so rather than silently doing nothing, because
 * "it did not send" and "it had already sent" are different things to the
 * person running it.
 */
export async function announce(issue: Issue): Promise<{ sent: number; failed: number }> {
	if (!newsletterEnabled()) throw new ValidationError('The newsletter is off on this instance.');
	if (announced(issue.version))
		throw new ValidationError(`${issue.version} has already gone out to the list.`);

	const where = origin();
	let sent = 0;
	let failed = 0;

	for (const email of confirmedAddresses()) {
		const stop = where ? `${where}/newsletter/off?t=${tokenFor(email)}` : '';
		// A subscriber may have an account here, and if they do it says which
		// language they read in. Most do not; those get the instance's.
		const t = await translatorFor(localeForAddress(email));
		try {
			await sendLogged(
				'newsletter-issue',
				{
					to: email,
					...renderEmail({
						subject: issue.subject,
						lines: issue.lines,
						// The issue is the operator's own words, in whatever language they
						// wrote it. Only the app's own button around it is translated.
						action: where ? { label: t('mail.newsletter.action'), url: where } : undefined,
						small: stop ? [t('mail.stopThese', { url: stop })] : []
					})
				},
				{ retryable: true }
			);
			sent += 1;
		} catch {
			failed += 1;
		}
	}

	db.insert(newsletterIssues)
		.values({ version: issue.version, subject: issue.subject, sent, failed })
		.run();

	return { sent, failed };
}

/** The token that is this address's way off the list. */
function tokenFor(email: string): string {
	return (
		db
			.select({ token: subscribers.token })
			.from(subscribers)
			.where(eq(subscribers.email, email))
			.get()?.token ?? ''
	);
}
