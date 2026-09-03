import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { mailFailures } from '../db/schema.js';
import { isEmailConfigured, sendEmail, type Email, type SendResult } from '../email.js';
import { NotFoundError, ValidationError } from './errors.js';

/**
 * Mail that must not fail silently.
 *
 * `sendEmail` is honest but forgetful: it logs a failure and moves on. This
 * wrapper remembers — a failed send becomes a `mail_failures` row, which
 * `/healthz` counts as a warning (the off-box watchers alert on warnings) and
 * `/admin` lists with a retry. A later successful send to the same address
 * for the same kind resolves the row, so the list is what is still wrong,
 * not a history.
 *
 * A box with no SMTP at all is a deliberate state for a self-hosted install
 * (the log is the transport), so unconfigured is only recorded when the
 * caller says so — the trial notice does, because an instance that sells
 * subscriptions has no business dropping the one mail money depends on.
 */

export type { MailKind } from '../../mail-kinds.js';
import type { MailKind } from '../../mail-kinds.js';

type Options = {
	/** Keep the body so the mail can be re-sent as it was. Only for mail whose links do not expire. */
	retryable?: boolean;
	/** Record "SMTP is not configured" as a failure too, instead of trusting the log. */
	trackUnconfigured?: boolean;
};

export type MailFailure = {
	id: number;
	kind: MailKind;
	toEmail: string;
	subject: string;
	error: string;
	attempts: number;
	retryable: boolean;
	createdAt: string;
	lastAttemptAt: string;
};

function recordFailure(kind: MailKind, email: Email, reason: string, retryable: boolean): void {
	const now = new Date().toISOString();
	const open = db
		.select({ id: mailFailures.id, attempts: mailFailures.attempts })
		.from(mailFailures)
		.where(
			and(
				eq(mailFailures.kind, kind),
				eq(mailFailures.toEmail, email.to),
				isNull(mailFailures.resolvedAt)
			)
		)
		.get();

	if (open) {
		db.update(mailFailures)
			.set({
				attempts: open.attempts + 1,
				error: reason,
				subject: email.subject,
				lastAttemptAt: now,
				...(retryable ? { bodyText: email.text, bodyHtml: email.html ?? null } : {})
			})
			.where(eq(mailFailures.id, open.id))
			.run();
		return;
	}

	db.insert(mailFailures)
		.values({
			kind,
			toEmail: email.to,
			subject: email.subject,
			error: reason,
			bodyText: retryable ? email.text : null,
			bodyHtml: retryable ? (email.html ?? null) : null,
			createdAt: now,
			lastAttemptAt: now
		})
		.run();
}

function resolveOpen(kind: MailKind, toEmail: string): void {
	db.update(mailFailures)
		.set({ resolvedAt: new Date().toISOString() })
		.where(
			and(
				eq(mailFailures.kind, kind),
				eq(mailFailures.toEmail, toEmail),
				isNull(mailFailures.resolvedAt)
			)
		)
		.run();
}

/** `sendEmail`, with the failure remembered and the recovery noticed. */
export async function sendLogged(
	kind: MailKind,
	email: Email,
	options: Options = {}
): Promise<SendResult> {
	const result = await sendEmail(email);

	if (result.delivered) {
		resolveOpen(kind, email.to);
	} else if (isEmailConfigured() || options.trackUnconfigured) {
		recordFailure(kind, email, result.reason ?? 'unknown', options.retryable ?? false);
	}

	return result;
}

/** What is still wrong, newest first — the /admin list and the /healthz count. */
export function openFailures(): MailFailure[] {
	return db
		.select({
			id: mailFailures.id,
			kind: mailFailures.kind,
			toEmail: mailFailures.toEmail,
			subject: mailFailures.subject,
			error: mailFailures.error,
			attempts: mailFailures.attempts,
			bodyText: mailFailures.bodyText,
			createdAt: mailFailures.createdAt,
			lastAttemptAt: mailFailures.lastAttemptAt
		})
		.from(mailFailures)
		.where(isNull(mailFailures.resolvedAt))
		.orderBy(desc(mailFailures.lastAttemptAt))
		.all()
		.map(({ bodyText, ...row }) => ({ ...row, retryable: bodyText !== null }));
}

/**
 * Send a stored mail again, as it was.
 *
 * Only for rows that kept their body. Auth mail cannot be replayed — its link
 * died within the hour — so the fix there is a fresh request, and the row
 * offers dismiss instead.
 */
export async function retryFailure(id: number): Promise<SendResult> {
	const row = db
		.select()
		.from(mailFailures)
		.where(and(eq(mailFailures.id, id), isNull(mailFailures.resolvedAt)))
		.get();
	if (!row) throw new NotFoundError('That failure is gone — resolved or dismissed already');
	if (row.bodyText === null) {
		throw new ValidationError(
			'This mail cannot be replayed — its link has expired. Ask for a fresh one.'
		);
	}

	const result = await sendEmail({
		to: row.toEmail,
		subject: row.subject,
		text: row.bodyText,
		html: row.bodyHtml ?? undefined
	});

	const now = new Date().toISOString();
	if (result.delivered) {
		db.update(mailFailures)
			.set({ resolvedAt: now, lastAttemptAt: now, attempts: row.attempts + 1 })
			.where(eq(mailFailures.id, id))
			.run();
	} else {
		db.update(mailFailures)
			.set({ error: result.reason ?? 'unknown', lastAttemptAt: now, attempts: row.attempts + 1 })
			.where(eq(mailFailures.id, id))
			.run();
	}
	return result;
}

/** Close the row without sending anything — for failures overtaken by events. */
export function dismissFailure(id: number): void {
	const row = db
		.select({ id: mailFailures.id })
		.from(mailFailures)
		.where(and(eq(mailFailures.id, id), isNull(mailFailures.resolvedAt)))
		.get();
	if (!row) throw new NotFoundError('That failure is gone — resolved or dismissed already');
	db.update(mailFailures)
		.set({ resolvedAt: new Date().toISOString() })
		.where(eq(mailFailures.id, id))
		.run();
}

/** How many mails are sitting failed — one number, for the health probe. */
export function openFailureCount(): number {
	const rows = db
		.select({ id: mailFailures.id })
		.from(mailFailures)
		.where(isNull(mailFailures.resolvedAt))
		.all();
	return rows.length;
}
