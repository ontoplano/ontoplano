import { createHash } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { requestReplays } from '$lib/db/schema.js';
import type { Ctx } from '$lib/services/ctx.js';
import { ConflictError, ValidationError } from '$lib/services/errors.js';
import { stamp } from '$lib/services/time.js';

/**
 * A create sent twice, answered once.
 *
 * An assistant that did not hear back from `add_task` cannot know whether the
 * task was made. If it sent a `requestId`, it can send the same call again:
 * within the window the first answer comes back and nothing runs a second
 * time. After the window the id is forgotten and a resend is a new call —
 * a retry is a matter of minutes, and a table of every answer ever given
 * would be a second copy of the account.
 *
 * Keyed per account, not per key: two assistants on one account that pick
 * the same id are the same caller as far as the data is concerned, and the
 * fingerprint stops either of them being answered for a call it did not make.
 */

/** How long a `requestId` is remembered. */
export const REQUEST_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The longest `requestId` accepted — room for a UUID and a prefix, not a payload. */
export const MAX_REQUEST_ID_LENGTH = 200;

/** Sorted keys all the way down, so the same arguments always read the same. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value !== null && typeof value === 'object')
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, canonical((value as Record<string, unknown>)[key])])
		);
	return value;
}

/** The call a `requestId` was used for: the tool, and its arguments without the id. */
export function fingerprintOf(tool: string, args: Record<string, unknown>): string {
	const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'requestId'));
	return createHash('sha256')
		.update(JSON.stringify([tool, canonical(rest)]))
		.digest('hex');
}

/** The id as sent, refused when it is not one. */
export function requestIdOf(value: unknown): string {
	if (typeof value !== 'string' || value.trim() === '')
		throw new ValidationError('`requestId` has to be a non-empty string.');
	if (value.length > MAX_REQUEST_ID_LENGTH)
		throw new ValidationError(`\`requestId\` may be at most ${MAX_REQUEST_ID_LENGTH} characters.`);
	return value;
}

const cutoff = (ctx: Ctx) => new Date(ctx.now.getTime() - REQUEST_REPLAY_WINDOW_MS).toISOString();

/**
 * The answer this id was given, when it was given within the window — or null.
 *
 * The same id with a different call is refused: answering "add milk" with the
 * answer to "add eggs" would say something was made that was not.
 */
export function replayOf(
	ctx: Ctx,
	requestId: string,
	fingerprint: string
): Record<string, unknown> | null {
	const row = db
		.select()
		.from(requestReplays)
		.where(and(eq(requestReplays.userId, ctx.userId), eq(requestReplays.requestId, requestId)))
		.get();
	if (!row || row.createdAt < cutoff(ctx)) return null;
	if (row.fingerprint !== fingerprint)
		throw new ConflictError(
			`\`requestId\` ${JSON.stringify(requestId)} was already used for a different call (\`${row.tool}\`). Use a new one for a new call.`,
			{ requestId, tool: row.tool }
		);
	return JSON.parse(row.answer) as Record<string, unknown>;
}

/** Remembers the answer, and forgets this account's ids that have run out. */
export function rememberAnswer(
	ctx: Ctx,
	requestId: string,
	tool: string,
	fingerprint: string,
	answer: unknown
): void {
	db.delete(requestReplays)
		.where(and(eq(requestReplays.userId, ctx.userId), lt(requestReplays.createdAt, cutoff(ctx))))
		.run();
	db.insert(requestReplays)
		.values({
			userId: ctx.userId,
			requestId,
			tool,
			fingerprint,
			answer: JSON.stringify(answer),
			createdAt: stamp(ctx)
		})
		.run();
}
