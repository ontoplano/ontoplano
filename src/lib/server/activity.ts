/**
 * When each account last used the app, kept on its row for the admin page.
 *
 * Every signed-in request counts — not a visit to the dashboard, which is one
 * door among several: the phone opens on the board, and somebody living in
 * their notebooks may not see the home screen for a week. A request is the
 * one thing every way of using the app has in common.
 *
 * Written at most once per `ACTIVE_STAMP_EVERY_MS` per account, so a page
 * that makes twenty requests costs nothing and an hour of use costs a few
 * writes. The throttle lives in memory: a restart forgets it, which costs one
 * write per account, once.
 */
import { sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';

/** How stale the stamp may get before a request writes it again. */
export const ACTIVE_STAMP_EVERY_MS = 5 * 60_000;

const written = new Map<string, number>();

/** This account just made a request. Answers whether it wrote. */
export function stampActive(userId: string, now: number = Date.now()): boolean {
	const last = written.get(userId);
	if (last !== undefined && now - last < ACTIVE_STAMP_EVERY_MS) return false;
	written.set(userId, now);
	/*
	 * By hand rather than through drizzle's `update(user)`, which would also
	 * move `updated_at` — and that column says when the account itself last
	 * changed, not when it was last opened.
	 */
	try {
		db.run(sql`update user set last_active_at = ${now} where id = ${userId}`);
	} catch {
		// A stamp that can fail somebody's request is worse than a stale one.
		return false;
	}
	return true;
}
