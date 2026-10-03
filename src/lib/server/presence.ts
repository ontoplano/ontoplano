/**
 * Who is using this instance right now: the accounts it has answered lately.
 *
 * Kept in memory and nowhere else. "Online" is a moment, not a fact worth a
 * table, and the process that answers the requests is the one place that
 * sees them all. `/metrics` reports the count, VictoriaMetrics keeps it, and
 * the ops page and the bot read it there — production and the demo side by
 * side, which no one instance's own page could do.
 */

/** How long after its last request an account still counts as online. */
export const ONLINE_WINDOW_MS = 5 * 60_000;

const lastSeen = new Map<string, number>();

/** This account just made a request. */
export function seen(userId: string, now: number = Date.now()): void {
	lastSeen.set(userId, now);
}

/** Accounts seen inside the window. Forgets the rest while it counts. */
export function onlineCount(now: number = Date.now()): number {
	for (const [userId, at] of lastSeen) if (now - at > ONLINE_WINDOW_MS) lastSeen.delete(userId);
	return lastSeen.size;
}
