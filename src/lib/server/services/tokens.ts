import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { apiTokens } from '$lib/db/schema.js';
import type { Ctx } from '$lib/services/ctx.js';
import { stamps } from '$lib/services/time.js';
import {
	ForbiddenError,
	NotFoundError,
	UnauthorizedError,
	ValidationError
} from '$lib/services/errors.js';
import { CONFINEMENTS, isConfinementKind, type Confinement } from '$lib/server/mcp/confinement.js';
import { KINDS } from '$lib/server/mcp/refs.js';
import { assertWithinLimit } from './subscriptions.js';
import { num, str } from '$lib/services/validate.js';

/**
 * Scopes an API token can hold.
 *
 * Deliberately narrow: a scale app on a phone needs to push weight readings
 * and read the schedule to set alarms. It must not be able to read the diary
 * if that phone is ever compromised.
 *
 * Each description is the sentence the person agrees to — "read everything on
 * your calendar", not `schedule:read`. A grant is consent, and consent given
 * to a string of jargon is not informed; the key is for the developer and the
 * docs, the sentence is for the owner of the data.
 */
export const SCOPES = {
	'streams:write': 'Send readings into your data streams, and create new streams',
	'streams:read': 'Read everything your data streams have ever recorded',
	'schedule:read': 'Read everything on your calendar for the days ahead, today included',
	/*
	 * Changing the week, as opposed to reading it.
	 *
	 * Everything a token could write used to be a list — todos, entries, ideas,
	 * shopping — and the week itself was read-only. So an assistant asked to
	 * "skip the gym and put deep work on this morning" could answer neither: it
	 * wrote a todo called "deep work 09:00-11:00" and left the gym sitting there
	 * unanswered, which is a worse day than the one it started with.
	 *
	 * Its own grant rather than part of `tasks:write`, because a todo list and a
	 * calendar are different things to hand over: one is a list somebody re-reads
	 * and the other is what their day looks like.
	 */
	'schedule:write':
		'Put blocks on your week — one-off and repeating — move and rename them, take them off a day, set reminders on them, and mark them done or skipped',
	'today:read': "See today's plan — the blocks and the tasks on it",
	/*
	 * Habits, on their own, because they are not the plan.
	 *
	 * They used to arrive inside `today:read`, which meant the phone widget's
	 * token — the one that sits on a lock screen — also reported which habits
	 * were kept and which were not. That is the most personal thing on the
	 * board and the least likely thing somebody wants shown there, and it was
	 * granted by a permission whose sentence was about the day's plan. A grant
	 * is only consent if the sentence names what is actually handed over, so
	 * this is its own line and its own tick.
	 */
	'habits:read': 'See your habits, which are due today, and whether you kept them',
	'habits:write': 'Mark a habit kept, or unmark one',
	'plugin:declare': 'Name and describe itself on your integrations page',
	'webhooks:manage':
		'Send itself a message when something changes here — a task finished, a block done — to an address it chooses',
	'shopping:read': 'See everything on your shopping list',
	'shopping:write': 'Add to your shopping list, tick things bought, and take things off it',
	/*
	 * The other half of the same room, and its own permission.
	 *
	 * A shopping list is what you are going to buy; an inventory is a map of
	 * your home — which room, which drawer, and what is in it. They share a
	 * table and they are not the same disclosure, so a widget that wanted the
	 * list does not get told where the spare keys are kept.
	 */
	'inventory:read': 'See where your things live, and what is in each room and drawer',
	'inventory:write': 'Add and change rooms and drawers, and say where a thing lives',
	/*
	 * The calendar feed's own scope, and the reason it has one.
	 *
	 * A calendar app cannot send a header, so the credential has to live in the
	 * URL — where it is written into a config file, walked past by every proxy in
	 * between, and sometimes shared with a household. `schedule:read` would have
	 * done the job and would have made every leak of that URL a leak of a token
	 * that might also write to the shopping list. This grants one thing, the feed
	 * route accepts nothing else, and what a leaked link costs is bounded.
	 */
	'calendar:read': 'Show your plan in a calendar app. It can see the plan and change nothing',
	/*
	 * The four an assistant asks for.
	 *
	 * `/api/mcp` lets a model do things in here on your behalf, and the useful
	 * ones are exactly the ones a narrow scope would forbid — "put this on my
	 * todo list", "write today up in the diary", "what am I meant to be doing".
	 * They are still four grants rather than one: reading your writing and
	 * changing your week are different permissions, and a token that only ever
	 * reads should be refused when it tries to write.
	 *
	 * Named for the room rather than the table, because that is what the person
	 * granting them is picturing.
	 */
	'notes:read': 'Read your diary and your notebooks',
	'notes:write': 'Write in your diary and your notebooks',
	/*
	 * Ideas, apart from notes.
	 *
	 * They rode inside `notes:*`, so a token that could add to the idea inbox
	 * could also read the diary — the most personal writing in the app,
	 * granted by a sentence about capturing thoughts. A capture tool needs
	 * the inbox and nothing else.
	 */
	'ideas:read': 'See your ideas',
	'ideas:write': 'Add ideas, change them, and remove them',
	'tasks:read': 'Read your todo list and your goals',
	'tasks:write': 'Add, finish and delete todos, move them on and off a day, and close a goal',
	'kitchen:read': 'Read your recipes',
	'kitchen:write': 'Add and change recipes',
	'workouts:read': 'See your workouts',
	'workouts:write':
		'Add and change workouts and their categories, put them away, and mark one done',
	'bills:read': 'See your bills, your recorded income, and what you have actually paid or received',
	'statements:read':
		'Read your imported bank-statement lines, their categories and tags, and the monthly in/out figures',
	'statements:write': 'Add and remove the rules that sort your statement lines',
	'bills:write': 'Add and change bills, and mark them paid',
	/*
	 * People, apart from everything: names, birthdays and phone numbers are
	 * other people's facts, held in this account — the one part of the data
	 * that is not only the owner's to hand over. Their own tick, so a token
	 * for the shopping list never learns who is in somebody's life.
	 */
	'people:read': 'See the people in your life, and whose birthday is coming',
	'people:write': 'Add people, and change what is recorded about them',
	'search:read': 'Search everything you have written, in one go',
	/*
	 * Deleting, apart from writing.
	 *
	 * A write scope used to be both: `tasks:write` was "add a todo" and it was
	 * "delete a todo", so the token that let an assistant append a line was the
	 * token that could remove things for good. They are different damage — a
	 * wrong write is data that is wrong, a wrong delete is data that is gone —
	 * so removing needs this grant on top of the room's own write scope. One
	 * extra tick rather than nine new scopes: the room already says where, this
	 * says how far.
	 */
	destructive:
		'Delete things outright — with only the write grants, it can add and change but never remove'
} as const;

export type Scope = keyof typeof SCOPES;

/**
 * The grants that deserve a louder line than their sentence.
 *
 * `search:read` is one tick that reads across every room. The sentence above
 * says what it does; this says what that means, before somebody grants it to
 * a widget that only wanted the shopping list.
 */
export const SCOPE_CAUTIONS: Partial<Record<Scope, string>> = {
	'search:read':
		'One grant that reads across everything — diary, notebooks, ideas, goals, people, recipes and todos. Only for something you would show all of that.',
	destructive:
		'What this deletes is gone. Leave it off unless you want the token removing things, not just adding and changing them.'
};

export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

const TOKEN_PREFIX = 'onto_';
const PREFIX_DISPLAY_LENGTH = TOKEN_PREFIX.length + 6;

function hashToken(plaintext: string): string {
	return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export interface CreatedToken {
	id: number;
	name: string;
	/** Shown exactly once. Not recoverable afterwards. */
	plaintext: string;
	prefix: string;
	scopes: Scope[];
	/** The one thing it may work on, or null for the whole account. */
	confinement: Confinement | null;
}

/**
 * How many calendar links one account may hold.
 *
 * More than one is the point — a phone, a laptop, a partner's calendar — and
 * each can be revoked without disturbing the others. A ceiling all the same:
 * these are readable addresses to somebody's whole plan, and an account that
 * has quietly accumulated forty of them cannot be reasoned about by the person
 * who owns it.
 */
export const CALENDAR_LINK_LIMIT = 5;

/** A calendar link is exactly this one scope — see the note beside it. */
export function isCalendarLink(scopes: readonly string[]): boolean {
	return scopes.length === 1 && scopes[0] === 'calendar:read';
}

export function createToken(
	ctx: Ctx,
	input: {
		name: unknown;
		scopes: unknown;
		expiresInDays?: unknown;
		confinedKind?: unknown;
		confinedId?: unknown;
	}
): CreatedToken {
	assertWithinLimit(ctx, 'apiTokens');

	const name = str(input.name, 'Token name', { max: 60 });

	const requested = Array.isArray(input.scopes)
		? input.scopes
		: typeof input.scopes === 'string'
			? input.scopes.split(',')
			: [];
	const scopes = [
		...new Set(
			requested
				.map((s) => String(s).trim())
				.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s))
		)
	];
	if (scopes.length === 0) throw new ForbiddenError('At least one valid scope is required');

	/*
	 * A calendar link stands alone, and it is refused rather than trimmed.
	 *
	 * The feed route accepts a token holding this scope and nothing else, so a
	 * token that mixed it with `shopping:write` would be a calendar address that
	 * does not work as one — and would carry a key that writes into a URL pasted
	 * into somebody's calendar app. Refusing says which of the two things they
	 * are making; combining silently makes neither.
	 */
	if (scopes.includes('calendar:read') && scopes.length > 1) {
		throw new ForbiddenError(
			'A calendar link reads your plan and nothing else — it cannot be combined with other scopes'
		);
	}

	if (isCalendarLink(scopes)) {
		const held = listTokens(ctx).filter((t) => isCalendarLink(t.scopes)).length;
		if (held >= CALENDAR_LINK_LIMIT) {
			throw new ForbiddenError(
				`That is ${CALENDAR_LINK_LIMIT} calendar links already. Revoke one to make another.`
			);
		}
	}

	let expiresAt: string | null = null;
	if (
		input.expiresInDays !== undefined &&
		input.expiresInDays !== null &&
		input.expiresInDays !== ''
	) {
		const days = num(input.expiresInDays, 'Expiry', { min: 1, max: 3650, int: true });
		expiresAt = new Date(ctx.now.getTime() + days * 86400_000).toISOString();
	}

	const confinement = confinementFrom(ctx, input);

	const plaintext = TOKEN_PREFIX + randomBytes(32).toString('base64url');
	const nowIso = ctx.now.toISOString();

	const row = db
		.insert(apiTokens)
		.values({
			...stamps(ctx),
			...stamps(ctx),
			userId: ctx.userId,
			name,
			tokenHash: hashToken(plaintext),
			// Kept only for a calendar link, so its address can be shown again.
			// See the column's own note in the schema.
			plaintext: isCalendarLink(scopes) ? plaintext : null,
			prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
			scopes: scopes.join(','),
			confinedKind: confinement?.kind ?? null,
			confinedId: confinement?.id ?? null,
			expiresAt,
			createdAt: nowIso,
			updatedAt: nowIso
		})
		.returning({ id: apiTokens.id, prefix: apiTokens.prefix })
		.get();

	return { id: row.id, name, plaintext, prefix: row.prefix, scopes, confinement };
}

/**
 * The one thing a key may work on, if the form asked for one.
 *
 * Two things are checked and neither is taken on trust. The kind has to name a
 * row in the confinement table — a string off a request never becomes a kind,
 * which is what stops a crafted form from inventing a reach. And the id has to
 * be one this account can list *now*, resolved through the same function the
 * assistant will resolve it through later, so a key cannot be minted against
 * somebody else's notebook.
 */
function confinementFrom(
	ctx: Ctx,
	input: { confinedKind?: unknown; confinedId?: unknown }
): Confinement | null {
	const kind = input.confinedKind;
	if (kind === undefined || kind === null || kind === '') return null;
	if (!isConfinementKind(kind))
		throw new ValidationError('That is not something a key can be tied to.');

	const id = num(input.confinedId, 'Which one', { int: true, min: 1 });
	const rows = KINDS[CONFINEMENTS[kind].kind].rows(ctx);
	if (!rows.some((row) => row.id === id)) throw new NotFoundError(CONFINEMENTS[kind].kind);

	return { kind, id };
}

export interface TokenSummary {
	id: number;
	name: string;
	prefix: string;
	scopes: Scope[];
	/** The whole token, for a calendar link and for nothing else. */
	plaintext: string | null;
	/** The one thing it may work on, or null for the whole account. */
	confinement: Confinement | null;
	lastUsedAt: string | null;
	expiresAt: string | null;
	createdAt: string;
}

export function listTokens(ctx: Ctx): TokenSummary[] {
	return db
		.select()
		.from(apiTokens)
		.where(and(eq(apiTokens.userId, ctx.userId), isNull(apiTokens.revokedAt)))
		.orderBy(desc(apiTokens.createdAt))
		.all()
		.map((t) => ({
			id: t.id,
			name: t.name,
			prefix: t.prefix,
			scopes: t.scopes.split(',').filter(Boolean) as Scope[],
			plaintext: t.plaintext,
			confinement: confinementOf(t.confinedKind, t.confinedId),
			lastUsedAt: t.lastUsedAt,
			expiresAt: t.expiresAt,
			createdAt: t.createdAt
		}));
}

export function revokeToken(ctx: Ctx, id: number): void {
	const res = db
		.update(apiTokens)
		.set({ revokedAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() })
		.where(and(eq(apiTokens.id, id), eq(apiTokens.userId, ctx.userId), isNull(apiTokens.revokedAt)))
		.run();
	if (res.changes === 0) throw new NotFoundError('Token');
}

export interface AuthenticatedToken {
	userId: string;
	tokenId: number;
	scopes: Scope[];
	/** The one thing this key may work on, or null for the whole account. */
	confinement: Confinement | null;
}

/**
 * A stored confinement, read back as one — or null.
 *
 * Null when either half is missing and null when the kind is no longer a kind,
 * which is the safe direction only because the caller treats "confined" as the
 * narrower case: a key that was tied to something is refused everything the
 * table no longer describes, rather than quietly widening to the account. See
 * `confine`, which throws on a kind it does not recognise.
 */
function confinementOf(kind: string | null, id: number | null): Confinement | null {
	if (!kind || id === null) return null;
	return { kind, id };
}

/**
 * Resolve a bearer token to its owner.
 *
 * Lookup is by hash, which is indexed and unique, so this is a single indexed
 * read. The `timingSafeEqual` below is belt-and-braces: the index lookup has
 * already made the comparison constant-ish, but the explicit check documents
 * the intent and costs nothing.
 */
export function authenticateToken(plaintext: string, now: Date): AuthenticatedToken {
	if (!plaintext || !plaintext.startsWith(TOKEN_PREFIX))
		throw new UnauthorizedError('Invalid token');

	const hash = hashToken(plaintext);
	const row = db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).get();
	if (!row) throw new UnauthorizedError('Invalid token');

	const a = Buffer.from(row.tokenHash, 'hex');
	const b = Buffer.from(hash, 'hex');
	if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedError('Invalid token');

	if (row.revokedAt) throw new UnauthorizedError('Token has been revoked');
	if (row.expiresAt && new Date(row.expiresAt) <= now)
		throw new UnauthorizedError('Token has expired');

	// Best-effort usage stamp; never let it fail the request.
	try {
		db.update(apiTokens)
			.set({ lastUsedAt: now.toISOString() })
			.where(eq(apiTokens.id, row.id))
			.run();
	} catch (e) {
		console.error('Failed to stamp token usage:', e);
	}

	return {
		userId: row.userId,
		tokenId: row.id,
		scopes: row.scopes.split(',').filter(Boolean) as Scope[],
		confinement: confinementOf(row.confinedKind, row.confinedId)
	};
}

export function requireScope(token: AuthenticatedToken, scope: Scope): void {
	if (!token.scopes.includes(scope))
		throw new ForbiddenError(`This token lacks the '${scope}' scope`);
}
