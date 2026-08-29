import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../db/index.js';
import { apiTokens } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { stamps } from './time.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.js';
import { assertWithinLimit } from './subscriptions.js';
import { num, str } from './validate.js';

/**
 * Scopes an API token can hold.
 *
 * Deliberately narrow: a-private-plugin running on a phone needs to push weight
 * readings and read the schedule to set alarms. It must not be able to read
 * the diary if that phone is ever compromised.
 *
 * Each description is the sentence the person agrees to — "read everything on
 * your calendar", not `schedule:read`. A grant is consent, and consent given
 * to a string of jargon is not informed; the key is for the developer and the
 * docs, the sentence is for the owner of the data.
 */
export const SCOPES = {
	'streams:write': 'Send readings into your data streams, and create new streams',
	'streams:read': 'Read everything your data streams have ever recorded',
	'schedule:read': 'Read everything on your calendar for the days ahead',
	'today:read': "See today's blocks, habits and tasks — what the phone widget shows",
	'plugin:declare': 'Name and describe itself on your integrations page',
	'webhooks:manage': 'Ask to be told when things happen — and manage those subscriptions'
} as const;

export type Scope = keyof typeof SCOPES;

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
}

export function createToken(
	ctx: Ctx,
	input: { name: unknown; scopes: unknown; expiresInDays?: unknown }
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

	let expiresAt: string | null = null;
	if (
		input.expiresInDays !== undefined &&
		input.expiresInDays !== null &&
		input.expiresInDays !== ''
	) {
		const days = num(input.expiresInDays, 'Expiry', { min: 1, max: 3650, int: true });
		expiresAt = new Date(ctx.now.getTime() + days * 86400_000).toISOString();
	}

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
			prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
			scopes: scopes.join(','),
			expiresAt,
			createdAt: nowIso,
			updatedAt: nowIso
		})
		.returning({ id: apiTokens.id, prefix: apiTokens.prefix })
		.get();

	return { id: row.id, name, plaintext, prefix: row.prefix, scopes };
}

export interface TokenSummary {
	id: number;
	name: string;
	prefix: string;
	scopes: Scope[];
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
		scopes: row.scopes.split(',').filter(Boolean) as Scope[]
	};
}

export function requireScope(token: AuthenticatedToken, scope: Scope): void {
	if (!token.scopes.includes(scope))
		throw new ForbiddenError(`This token lacks the '${scope}' scope`);
}
