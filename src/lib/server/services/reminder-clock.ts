import { and, asc, isNull, lte } from 'drizzle-orm';

import { db } from '../db/index.js';
import { reminders } from '../db/schema.js';
import { offsetAt } from './time.js';
import { serverTimezone } from './ctx.js';
import { getTimezone } from '../settings.js';

/**
 * The thing that makes a reminder arrive when it says it will.
 *
 * ## Why not a timer every minute
 *
 * There was one: a systemd unit that asked the app, once a minute, whether
 * anything was due. It works, and it is late by up to fifty-nine seconds every
 * single time. A reminder is a time — being told at 09:00:47 that something
 * starts at 09:00 is being told late, and an alarm for seven in the morning
 * that goes off at some point during the seventh minute is not an alarm.
 *
 * ## Why not "work out the next one and sleep until then"
 *
 * Because the database changes underneath you. Sleep until 15:00 because that
 * is the next thing, have somebody set an alarm for 14:10, and you wake at
 * three to a reminder that was fifty minutes late. That is the failure mode
 * that makes the obvious design wrong, and it is the reason for both halves of
 * what is here:
 *
 *   1. **Every write wakes it.** `wake()` throws the current sleep away and
 *      asks the question again. Anything that creates, moves or removes a
 *      reminder calls it, so a new earliest reminder reschedules the clock the
 *      moment it exists rather than the next time the clock happens to look.
 *
 *   2. **It never sleeps longer than a minute anyway.** A write path that
 *      forgets to call `wake()` costs at most sixty seconds, not the hours
 *      until whatever it was sleeping for — and the same ceiling covers the
 *      things no write can notify us about: the machine suspending, the clock
 *      being stepped, a daylight-saving change moving every wall-clock
 *      reminder in a zone at once.
 *
 * So the fast path is exact and the slow path is the behaviour it replaced.
 * There is no arrangement of events that makes this later than the timer it
 * replaces, and in the ordinary case it is exact to the second.
 *
 * ## One process
 *
 * This is a single node process with a single sqlite file, so this is a timer
 * in it — no queue, no second daemon, nothing to keep alive. The systemd unit
 * stays as a belt: it costs one request a minute and covers the case where the
 * app was restarted between a reminder falling due and anybody noticing.
 */

/** Never asleep longer than this, whatever the next reminder says. */
export const MAX_SLEEP_MS = 60_000;

/**
 * How long after a wake-up to actually run.
 *
 * Firing on the exact millisecond risks running a hair early — `setTimeout` is
 * allowed to be a millisecond fast — and a reminder that is "not due yet" by
 * two milliseconds is skipped and then waited for again. A quarter second late
 * is invisible and always correct.
 */
const GRACE_MS = 250;

declare global {
	var __ontoplanoReminderClock: { timer?: ReturnType<typeof setTimeout>; running?: boolean };
}

const state = (globalThis.__ontoplanoReminderClock ??= {});

/**
 * The instant the next unsent reminder falls due, or null if there is none.
 *
 * `remind_at` is wall-clock in the account's own zone — "remind me at ten to
 * nine" means ten to nine wherever that person is — so each account's earliest
 * has to be converted with that account's offset before they can be compared.
 * The SQL ceiling keeps the scan small: nothing anywhere can be due more than
 * a day and change from now in any zone.
 */
export function nextDueAt(now = new Date()): Date | null {
	const horizon = new Date(now.getTime() + 26 * 3600_000).toISOString().slice(0, 19);
	const rows = db
		.select({ userId: reminders.userId, remindAt: reminders.remindAt })
		.from(reminders)
		.where(
			and(
				isNull(reminders.pushedAt),
				isNull(reminders.dismissedAt),
				lte(reminders.remindAt, horizon)
			)
		)
		.orderBy(asc(reminders.remindAt))
		.limit(500)
		.all();

	if (rows.length === 0) return null;

	// One zone lookup per account, not per reminder: an account with fifty
	// reminders in the window is the ordinary case, not the exception.
	const zones = new Map<string, string>();
	let earliest: number | null = null;

	for (const row of rows) {
		let zone = zones.get(row.userId);
		if (zone === undefined) {
			zone = getTimezone(row.userId) ?? serverTimezone();
			zones.set(row.userId, zone);
		}
		const at = instantOfLocal(row.remindAt, zone);
		if (at === null) continue;
		if (earliest === null || at < earliest) earliest = at;
	}

	return earliest === null ? null : new Date(earliest);
}

/**
 * A wall-clock string in a zone, as an instant.
 *
 * Read as UTC first and then corrected by that zone's offset at roughly the
 * right moment — the same trick `localOfInstant` uses in the other direction.
 * An hour either side of a daylight-saving step is ambiguous by definition;
 * being a minute out twice a year is well inside what the ceiling covers.
 */
function instantOfLocal(local: string, zone: string): number | null {
	const asUtc = Date.parse(`${local.length === 16 ? local + ':00' : local}Z`);
	if (Number.isNaN(asUtc)) return null;
	return asUtc - offsetAt(new Date(asUtc), zone);
}

/** Throw away the current sleep and ask again. Cheap; call it freely. */
export function wake(): void {
	if (state.timer) clearTimeout(state.timer);
	state.timer = undefined;
	schedule();
}

function schedule(): void {
	if (state.timer) return;

	const next = nextDueAt();
	const wait =
		next === null
			? MAX_SLEEP_MS
			: Math.min(MAX_SLEEP_MS, Math.max(0, next.getTime() - Date.now()) + GRACE_MS);

	state.timer = setTimeout(tick, wait);
	// A reminder must never be the reason a process refuses to exit.
	state.timer.unref?.();
}

async function tick(): Promise<void> {
	state.timer = undefined;

	// Never two passes at once: a slow push must not have a second pass reading
	// the same rows behind it. The stamps make that safe anyway; this keeps it
	// from being tested.
	if (state.running) {
		schedule();
		return;
	}

	state.running = true;
	try {
		const { deliverDueReminders } = await import('./reminder-delivery.js');
		await deliverDueReminders();
	} catch (e) {
		console.error('Reminder clock failed a pass:', e);
	} finally {
		state.running = false;
		schedule();
	}
}

/** Start it. Idempotent, because SvelteKit imports its hooks more than once. */
export function startReminderClock(): void {
	if (state.timer) return;
	schedule();
}
