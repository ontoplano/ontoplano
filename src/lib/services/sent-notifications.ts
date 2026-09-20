/**
 * What the app has told somebody, kept so they can read it again.
 *
 * A push happens once. It lands on whichever device was awake, somebody
 * clears a lock screen, and it is gone — so "what did it tell me while I was
 * out" had no answer. This is the answer, and the reason the table exists.
 *
 * Everything the server sends is written here on its way out, at the one
 * function that sends: a new kind of notification is recorded without anybody
 * remembering to add it. See `pushToUser`.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { sentNotifications } from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';
import { stamp } from './time.js';

/**
 * How many are kept per account.
 *
 * A log nobody prunes is a table that grows for as long as the app runs, and
 * nothing below the first screenful is ever read. Trimmed on write, so the
 * cost is paid by the thing that caused it.
 */
export const KEPT_PER_ACCOUNT = 200;

/** How many the menu shows without being asked for more. */
export const SHOWN_IN_MENU = 12;

export type Sent = {
	id: number;
	title: string;
	body: string;
	url: string | null;
	kind: string;
	readAt: string | null;
	createdAt: string;
};

const MAX_TITLE = 200;
const MAX_BODY = 1000;

/** Only this account's, and only ones nobody has read. */
const unread = (userId: string) =>
	and(eq(sentNotifications.userId, userId), isNull(sentNotifications.readAt));

/**
 * Write one down.
 *
 * Takes a plain user id rather than a `Ctx`, because the thing that calls it
 * is a delivery pass working through a list of accounts and has no context
 * for any of them.
 */
export function record(
	userId: string,
	what: {
		title: string;
		body?: string;
		url?: string | null;
		kind?: string;
		/**
		 * Already read, for one the person was looking at when it arrived.
		 *
		 * A reminder that fires while the app is open is raised by the page
		 * itself. It still belongs in the list — "what was I told today" has
		 * to have one answer — but it is not waiting on anybody, and an unread
		 * count for something you watched appear is a lie.
		 */
		seen?: boolean;
	},
	now = new Date()
): Sent {
	const row = db
		.insert(sentNotifications)
		.values({
			userId,
			// Trimmed rather than trusted: these end up on a screen, and a title
			// the length of a paragraph is a menu nobody can read.
			title: String(what.title ?? '')
				.trim()
				.slice(0, MAX_TITLE),
			body: String(what.body ?? '')
				.trim()
				.slice(0, MAX_BODY),
			url: what.url ?? null,
			kind: String(what.kind ?? ''),
			readAt: what.seen ? now.toISOString() : null,
			createdAt: now.toISOString()
		})
		.returning()
		.get();

	trim(userId);
	return toSent(row);
}

/** Drop everything past the ceiling, oldest first. */
function trim(userId: string): void {
	db.run(sql`
		delete from ${sentNotifications}
		where ${sentNotifications.userId} = ${userId}
		and ${sentNotifications.id} not in (
			select ${sentNotifications.id} from ${sentNotifications}
			where ${sentNotifications.userId} = ${userId}
			order by ${sentNotifications.id} desc
			limit ${KEPT_PER_ACCOUNT}
		)
	`);
}

function toSent(row: typeof sentNotifications.$inferSelect): Sent {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		url: row.url,
		kind: row.kind,
		readAt: row.readAt,
		createdAt: row.createdAt
	};
}

export function list(ctx: Ctx, limit = SHOWN_IN_MENU): Sent[] {
	return db
		.select()
		.from(sentNotifications)
		.where(eq(sentNotifications.userId, ctx.userId))
		.orderBy(desc(sentNotifications.id))
		.limit(Math.max(1, Math.min(limit, KEPT_PER_ACCOUNT)))
		.all()
		.map(toSent);
}

export function unreadCount(ctx: Ctx): number {
	const [row] = db
		.select({ held: sql<number>`count(*)` })
		.from(sentNotifications)
		.where(unread(ctx.userId))
		.all();
	return row?.held ?? 0;
}

/**
 * Mark one read.
 *
 * Already-read stays as it was: the first time somebody saw a thing is the
 * useful fact, and re-reading it does not move that.
 */
export function markRead(ctx: Ctx, id: number): void {
	const row = db
		.update(sentNotifications)
		.set({ readAt: stamp(ctx) })
		.where(and(eq(sentNotifications.id, id), unread(ctx.userId)))
		.returning()
		.get();

	if (row) return;

	// Not found, or already read. Only the first is worth complaining about.
	const exists = db
		.select({ id: sentNotifications.id })
		.from(sentNotifications)
		.where(and(eq(sentNotifications.id, id), eq(sentNotifications.userId, ctx.userId)))
		.get();
	if (!exists) throw new NotFoundError('No such notification.');
}

/**
 * Mark every one of them read.
 *
 * What opening the list means: they have been seen. The count is about "is
 * there anything I have not looked at", and looking at them answers it — a
 * badge that survives being read is a badge people stop believing.
 */
export function markAllRead(ctx: Ctx): number {
	const rows = db
		.update(sentNotifications)
		.set({ readAt: stamp(ctx) })
		.where(unread(ctx.userId))
		.returning()
		.all();
	return rows.length;
}
