import { and, asc, eq } from 'drizzle-orm';

import { eventsBetween, type IcsEvent } from '../../ics.js';
import { db } from '../db/index.js';
import { calendarFeeds } from '../db/schema.js';
import { assertPublicUrl, fetchPublic } from '../outbound.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';
import { stamp } from './time.js';
import { str } from './validate.js';

/**
 * Calendars somebody else controls.
 *
 * One-way and read-only, which is the whole design rather than a limitation:
 * an `.ics` address needs no OAuth, stores no token that could be stolen, and
 * works for Google, Outlook, Fastmail, Nextcloud and anything else, because it
 * is the one thing they all agree on.
 *
 * The fetch is deliberately not a background job. A feed is refreshed when the
 * page that draws it notices the copy is stale, which means no scheduler to
 * keep alive on a self-hosted box and no work done for an account nobody is
 * looking at.
 */

export const MAX_NAME_LENGTH = 80;
export const MAX_URL_LENGTH = 2000;
/** How long a copy is good for. Work calendars do not change by the minute. */
export const STALE_AFTER_MINUTES = 60;
/** A calendar is text; anything this size is not one. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type Feed = {
	id: number;
	name: string;
	url: string;
	color: string;
	fetchedAt: string | null;
	lastError: string | null;
};

export function listFeeds(ctx: Ctx): Feed[] {
	return db
		.select({
			id: calendarFeeds.id,
			name: calendarFeeds.name,
			url: calendarFeeds.url,
			color: calendarFeeds.color,
			fetchedAt: calendarFeeds.fetchedAt,
			lastError: calendarFeeds.lastError
		})
		.from(calendarFeeds)
		.where(eq(calendarFeeds.userId, ctx.userId))
		.orderBy(asc(calendarFeeds.name))
		.all();
}

/**
 * What an address has to look like before we will fetch it.
 *
 * `http(s)` only, and nothing that points at this machine or its network —
 * the shared guard in `$lib/server/outbound` decides that, here at add time
 * for the person's benefit and again inside every connection the refresh
 * makes, which is the check that actually holds. Google's iCal addresses are
 * `https` and public, so this costs nothing anybody actually wants.
 */
function parseUrl(raw: unknown): string {
	const value = str(raw, 'address', { max: MAX_URL_LENGTH });

	// `webcal://` is what a calendar app registers; it is https underneath.
	const normalised = value.replace(/^webcal:\/\//i, 'https://');

	return assertPublicUrl(normalised, 'calendar address').toString();
}

export function addFeed(ctx: Ctx, raw: { name?: unknown; url?: unknown; color?: unknown }): number {
	const url = parseUrl(raw.url);
	const name = str(raw.name ?? 'Calendar', 'name', { max: MAX_NAME_LENGTH });
	const color =
		typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#6b7280';

	const inserted = db
		.insert(calendarFeeds)
		.values({ userId: ctx.userId, name, url, color })
		.returning({ id: calendarFeeds.id })
		.get();

	return inserted.id;
}

export function removeFeed(ctx: Ctx, id: number): boolean {
	return (
		db
			.delete(calendarFeeds)
			.where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, ctx.userId)))
			.run().changes > 0
	);
}

function isStale(fetchedAt: string | null, now: Date): boolean {
	if (!fetchedAt) return true;
	const at = new Date(fetchedAt).getTime();
	if (!Number.isFinite(at)) return true;
	return now.getTime() - at > STALE_AFTER_MINUTES * 60_000;
}

/**
 * Fetch one feed, whatever its state.
 *
 * A failure is written to the row rather than thrown: a calendar that stopped
 * answering should say so on the page, not take the planner down with it, and
 * the last good copy keeps being drawn in the meantime.
 */
export async function refreshFeed(ctx: Ctx, id: number): Promise<void> {
	const feed = db
		.select({ url: calendarFeeds.url })
		.from(calendarFeeds)
		.where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, ctx.userId)))
		.get();

	if (!feed) throw new NotFoundError('calendar');

	try {
		const res = await fetchPublic(feed.url, {
			redirect: 'follow',
			headers: { accept: 'text/calendar, text/plain' },
			signal: AbortSignal.timeout(15_000)
		});

		if (!res.ok) throw new Error(`the calendar answered ${res.status}`);

		const body = await res.text();
		if (body.length > MAX_BODY_BYTES) throw new Error('that calendar is too large to keep');
		if (!body.includes('BEGIN:VCALENDAR')) throw new Error('that address is not a calendar');

		db.update(calendarFeeds)
			.set({ body, fetchedAt: stamp(ctx), lastError: null })
			.where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, ctx.userId)))
			.run();
	} catch (error) {
		db.update(calendarFeeds)
			.set({
				fetchedAt: stamp(ctx),
				lastError: error instanceof Error ? error.message.slice(0, 200) : 'the fetch failed'
			})
			.where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.userId, ctx.userId)))
			.run();
	}
}

/** Refresh whatever has gone stale, in parallel, swallowing nothing silently. */
export async function refreshStale(ctx: Ctx): Promise<void> {
	const stale = db
		.select({ id: calendarFeeds.id, fetchedAt: calendarFeeds.fetchedAt })
		.from(calendarFeeds)
		.where(eq(calendarFeeds.userId, ctx.userId))
		.all()
		.filter((f) => isStale(f.fetchedAt, ctx.now));

	await Promise.all(stale.map((f) => refreshFeed(ctx, f.id)));
}

export type SubscribedEvent = IcsEvent & { feedId: number; feedName: string; color: string };

/** Everything from every subscribed calendar in a window. */
export function subscribedEvents(ctx: Ctx, from: Date, to: Date): SubscribedEvent[] {
	const rows = db
		.select({
			id: calendarFeeds.id,
			name: calendarFeeds.name,
			color: calendarFeeds.color,
			body: calendarFeeds.body
		})
		.from(calendarFeeds)
		.where(eq(calendarFeeds.userId, ctx.userId))
		.all();

	const out: SubscribedEvent[] = [];

	for (const row of rows) {
		if (!row.body) continue;
		for (const event of eventsBetween(row.body, from, to)) {
			out.push({ ...event, feedId: row.id, feedName: row.name, color: row.color });
		}
	}

	return out.sort((a, b) => a.start.localeCompare(b.start));
}
