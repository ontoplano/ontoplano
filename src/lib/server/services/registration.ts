import { randomBytes } from 'node:crypto';

import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { isRegistrationMode, loadConfig, saveConfig, type RegistrationMode } from '../config.js';
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
	/** When the code stops working. */
	expiresAt: string | null;
	/** When what it hands over runs out. Null is the open-ended alpha grant. */
	grantsUntil: string | null;
	usedAt: string | null;
	usedBy: string | null;
};

/**
 * How long the grant lasts, when nobody says otherwise.
 *
 * The point of an invitation on a paying instance is to hand somebody the app
 * for a while without asking for a card first — so the default is a month, and
 * the form says so as a date the operator can change.
 */
export const DEFAULT_GRANT_DAYS = 30;

/** A month from now, as the date the invite form opens on. */
export function defaultGrantUntil(now: Date): string {
	return new Date(now.getTime() + DEFAULT_GRANT_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Who may create an account here.
 *
 * The environment wins over the config file. That exists because the config
 * file is written from the web page: on a box you administer over ssh, being
 * able to open registration without logging in — or before there is anybody to
 * log in as — is the difference between a deploy and an afternoon.
 *
 * `ONTOPLANO_REGISTRATION=open|invite|closed` is the whole of it.
 *
 * **Staging does not imply open, and no environment implies anything.** It used
 * to: `ONTOPLANO_STAGING=true` quietly returned `open`, which meant the copy
 * people test on was answering a question differently from the instance it is
 * a copy of. A staging instance exists to behave exactly like production and
 * be labelled as not being it; the moment a code path asks which one it is
 * running on, it has stopped testing the thing it is standing in for. If a
 * staging box should take sign-ups, its env file says `ONTOPLANO_REGISTRATION=open`
 * out loud, and that is a sentence somebody wrote rather than a consequence.
 */
export function registrationMode(): RegistrationMode {
	const fromEnv = process.env.ONTOPLANO_REGISTRATION;
	if (isRegistrationMode(fromEnv)) return fromEnv;
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
 * like. A closed instance answers flatly; an invite-only one says what was
 * wrong with the code — the register form already announces that codes exist,
 * so "not accepting new accounts" to somebody holding a mistyped one was
 * secrecy about a fact the same page states, and read as "your invitation is
 * worthless".
 */
export function checkSignUpAllowed(code: unknown, now: Date): { invite: Invite | null } {
	if (instanceIsEmpty()) return { invite: null };

	const mode = registrationMode();
	const trimmed = typeof code === 'string' ? code.trim() : '';

	/*
	 * Open registration still honours a code.
	 *
	 * Anybody may sign up, so a code is not permission — it is what it grants: a
	 * month of the app handed over directly, with no card and no trial. Without this
	 * branch an invitation was silently ignored the moment the instance opened,
	 * and the person it was sent to met the checkout like everybody else.
	 *
	 * A code that is given and does not work is refused rather than dropped, and
	 * says so plainly: there is nothing to leak about an instance that already
	 * lets anybody in, and quietly charging somebody who was told they had a free
	 * month is the worse failure by far.
	 */
	if (mode === 'open') {
		if (!trimmed) return { invite: null };

		const invite = findUsable(trimmed, now);
		if (!invite) throw new ForbiddenError('That invitation code is not valid, or has been used');
		return { invite };
	}

	if (mode === 'closed') throw new ForbiddenError('This instance is not accepting new accounts');

	if (!trimmed) throw new ForbiddenError('Registering here takes an invitation code');

	const invite = findUsable(trimmed, now);
	if (!invite) throw new ForbiddenError('That invitation code is not valid, or has been used');

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
	raw: { note?: unknown; expiresInDays?: unknown; grantsUntil?: unknown },
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
		.values({
			code,
			note,
			createdBy,
			expiresAt,
			grantsUntil: parseGrantUntil(raw.grantsUntil, now),
			createdAt: now.toISOString()
		})
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

/**
 * When what this invitation hands over runs out.
 *
 * A date from the form (`<input type="date">`), read as the end of that day so
 * that "until the 30th" includes the 30th. Empty means the open-ended alpha
 * grant, which is what an instance that sells nothing wants.
 */
function parseGrantUntil(raw: unknown, now: Date): string | null {
	if (raw === undefined || raw === null || raw === '') return null;

	const value = str(raw, 'until', { max: 40 });
	const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
	if (!match) throw new ValidationError('Invalid date');

	const until = new Date(`${match[1]}T23:59:59.999Z`);
	if (isNaN(until.getTime())) throw new ValidationError('Invalid date');
	if (until.getTime() <= now.getTime())
		throw new ValidationError('A free month that has already ended grants nothing');

	return until.toISOString();
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
