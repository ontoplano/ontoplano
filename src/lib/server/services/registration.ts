import { randomBytes } from 'node:crypto';

import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { loadConfig, saveConfig, type RegistrationMode } from '../config.js';
import { db } from '../db/index.js';
import { invites } from '../db/schema.js';
import { user } from '../db/auth.schema.js';
import { ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { optionalStr, str } from './validate.js';

/**
 * Who is allowed to create an account here.
 *
 * The instance decides, not the person signing up, so the mode lives in the
 * config file beside the other deployment settings. Enforcement is in
 * `hooks.server.ts` rather than in a route, because sign-up is better-auth's
 * endpoint and the answer has to be the same however it is reached.
 */

export const MAX_NOTE_LENGTH = 200;
const CODE_BYTES = 12;

export type Invite = {
	id: number;
	code: string;
	note: string;
	createdAt: string;
	expiresAt: string | null;
	usedAt: string | null;
	usedBy: string | null;
};

export function registrationMode(): RegistrationMode {
	return loadConfig().registration.mode;
}

export function setRegistrationMode(mode: RegistrationMode): void {
	const current = loadConfig();
	saveConfig({ ...current, registration: { mode } });
}

/** Whether anybody has an account yet. The first one is always allowed in. */
export function instanceIsEmpty(): boolean {
	return db.select({ id: user.id }).from(user).limit(1).get() === undefined;
}

/**
 * May this sign-up proceed?
 *
 * Returns the invite it consumed, if any, so the caller can mark it used once
 * the account actually exists. Throwing here is what a refused sign-up looks
 * like — the message is deliberately the same for "closed" and "no code",
 * because a stranger learning *why* they were refused learns how the instance
 * is configured.
 */
export function checkSignUpAllowed(code: unknown, now: Date): { invite: Invite | null } {
	if (instanceIsEmpty()) return { invite: null };

	const mode = registrationMode();
	if (mode === 'open') return { invite: null };
	if (mode === 'closed') throw new ForbiddenError('This instance is not accepting new accounts');

	const trimmed = typeof code === 'string' ? code.trim() : '';
	if (!trimmed) throw new ForbiddenError('This instance is not accepting new accounts');

	const invite = findUsable(trimmed, now);
	if (!invite) throw new ForbiddenError('This instance is not accepting new accounts');

	return { invite };
}

/** Called once the account exists, so a failed sign-up does not burn a code. */
export function consumeInvite(id: number, userId: string, now: Date): void {
	db.update(invites)
		.set({ usedAt: now.toISOString(), usedBy: userId })
		.where(and(eq(invites.id, id), isNull(invites.usedAt)))
		.run();
}

export function listInvites(): Invite[] {
	return db
		.select()
		.from(invites)
		.orderBy(desc(invites.createdAt))
		.all()
		.map((row) => ({ ...row, note: row.note ?? '' }));
}

export function createInvite(
	createdBy: string,
	raw: { note?: unknown; expiresInDays?: unknown },
	now: Date
): Invite {
	const note = optionalStr(raw.note, 'note', { max: MAX_NOTE_LENGTH });

	const days =
		raw.expiresInDays === undefined || raw.expiresInDays === null || raw.expiresInDays === ''
			? null
			: Number(raw.expiresInDays);

	if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365))
		throw new ValidationError('An invite lasts between 1 and 365 days');

	const expiresAt =
		days === null ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

	// URL-safe and long enough that guessing is not a strategy.
	const code = randomBytes(CODE_BYTES).toString('base64url');

	const inserted = db
		.insert(invites)
		.values({ code, note, createdBy, expiresAt, createdAt: now.toISOString() })
		.returning()
		.get();

	return { ...inserted, note: inserted.note ?? '' };
}

/** Revoking an unused invite deletes it; a used one is history and stays. */
export function revokeInvite(id: number): void {
	const res = db
		.delete(invites)
		.where(and(eq(invites.id, id), isNull(invites.usedAt)))
		.run();

	if (res.changes === 0) throw new NotFoundError('invite');
}

function findUsable(code: string, now: Date): Invite | null {
	const trimmed = str(code, 'invite', { max: 64 });

	const row = db
		.select()
		.from(invites)
		.where(and(eq(invites.code, trimmed), isNull(invites.usedAt)))
		.get();

	if (!row) return null;
	if (row.expiresAt && row.expiresAt < now.toISOString()) return null;

	return { ...row, note: row.note ?? '' };
}

/** How many invites are outstanding, for the settings page. */
export function openInviteCount(): number {
	return db.select({ n: count() }).from(invites).where(isNull(invites.usedAt)).get()?.n ?? 0;
}
