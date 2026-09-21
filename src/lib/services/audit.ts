import { and, desc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { auditEvents } from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';

/**
 * What happened to an account.
 *
 * Deliberately append-only and deliberately dull: a row is a verb, a subject,
 * whoever did it, and enough detail to read it back a year later. Nothing here
 * throws — a log that can fail a sign-in is worse than a gap in the log.
 */

export const AUDIT_EVENTS = [
	'signed_in',
	'signed_out',
	'registered',
	'email_verified',
	'password_changed',
	'email_change_requested',
	'sessions_revoked',
	'data_exported',
	'data_imported',
	'account_deleted',
	// Emptied, not deleted: the account is still here and so is this line,
	// which `emptyAccount` keeps on purpose.
	'account_emptied',
	'role_changed',
	'plan_changed',
	'plan_end_set',
	'verification_resent',
	// Somebody being given or taken off a paid seat is somebody's access
	// changing without them doing anything, which is exactly what a log is for.
	'seat_added',
	'seat_offered',
	'seat_offer_withdrawn',
	'seat_accepted',
	'seat_declined',
	'seat_removed',
	/*
	 * Somebody turned away from the demo, and which of the two reasons it was.
	 *
	 * Not about an account — there is none yet — so it is filed against the
	 * address rather than a person, which is the only thing there is to know.
	 * It is here because "am I being banned from my own demo" is a question
	 * the operator has had to answer by guessing, and the digest can answer it
	 * with a number instead.
	 */
	'demo_refused'
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export type AuditEntry = {
	id: number;
	event: string;
	detail: Record<string, unknown>;
	actorId: string | null;
	ip: string | null;
	createdAt: string;
};

export function record(
	subjectId: string,
	event: AuditEvent,
	options: { actorId?: string | null; detail?: Record<string, unknown>; ip?: string | null } = {}
): void {
	try {
		db.insert(auditEvents)
			.values({
				userId: subjectId,
				actorId: options.actorId ?? null,
				event,
				detail: JSON.stringify(options.detail ?? {}),
				ip: options.ip ?? null,
				createdAt: new Date().toISOString()
			})
			.run();
	} catch (e) {
		// A missing line in the history is a smaller problem than a failed sign-in.
		console.error('audit: could not record', event, e);
	}
}

/** The account's own history, newest first. */
export function listForUser(ctx: Ctx, limit = 50): AuditEntry[] {
	return read(ctx.userId, limit);
}

/** The same, for an administrator looking at somebody else's account. */
export function listForSubject(subjectId: string, limit = 50): AuditEntry[] {
	return read(subjectId, limit);
}

function read(subjectId: string, limit: number): AuditEntry[] {
	return db
		.select()
		.from(auditEvents)
		.where(eq(auditEvents.userId, subjectId))
		.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
		.limit(limit)
		.all()
		.map((row) => ({
			id: row.id,
			event: row.event,
			detail: parse(row.detail),
			actorId: row.actorId,
			ip: row.ip,
			createdAt: row.createdAt
		}));
}

/** Whether an account has ever done a thing — used for "first export" style checks. */
export function hasEvent(subjectId: string, event: AuditEvent): boolean {
	return (
		db
			.select({ id: auditEvents.id })
			.from(auditEvents)
			.where(and(eq(auditEvents.userId, subjectId), eq(auditEvents.event, event)))
			.get() !== undefined
	);
}

function parse(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}
