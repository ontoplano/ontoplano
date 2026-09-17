import { db } from '$lib/db/index.js';
import { pushSubscriptions, user } from '$lib/db/schema.js';
import { buildCtx } from '$lib/services/ctx.js';
import { ensureBirthdayReminders } from '$lib/services/birthdays.js';
import { ensureOwnReminders } from '$lib/services/reminder-sources.js';
import { markPushed, pushableReminders } from '$lib/services/reminders.js';
import { pushConfigured, pushToUser } from './push.js';
import { soundFor } from '$lib/services/ringtones.js';
import { localOfInstant } from '$lib/services/time.js';

/**
 * The pass that makes a reminder arrive with the app shut.
 *
 * Everything else about reminders is written for somebody who is looking: the
 * planner card, the poll, the notification raised by an open page. That covers
 * the person who did not need reminding. This is the other half — a phone in a
 * pocket, a laptop asleep — and it is the reason the feature exists.
 *
 * Run it every minute. It is cheap on the ordinary minute: one indexed query
 * over reminders that are due and unpushed, and on most minutes that answers
 * nothing and the pass ends. Safe to run twice — `pushed_at` is stamped only
 * after the push actually left, so a crash halfway repeats at most one message
 * rather than losing one.
 *
 * ## Birthdays
 *
 * Written here as well, because the row has to exist before the minute it is
 * due — nobody is looking at the app at six in the morning, which is the whole
 * point. Idempotent per person per day, so this and the poll cannot make two.
 */
export async function deliverDueReminders(now = new Date()): Promise<{
	pushed: number;
	accounts: number;
	/** Browsers signed up across every account. Zero is the commonest answer. */
	devices: number;
	/** Due and unpushed at the moment of the pass. */
	due: number;
	/** Birthday rows written by this pass. */
	birthdays: number;
	/** Review and bill rows written by this pass. */
	written: number;
	/** False when the instance has no keys, so nothing can be pushed at all. */
	configured: boolean;
}> {
	/*
	 * Every account, not only the ones with a confirmed address.
	 *
	 * The weekly mail asks for a verified address because it is mail. Nothing
	 * here is: a push subscription exists because somebody signed in on that
	 * browser and said yes, and a birthday belongs to whoever wrote it down.
	 * Filtering on verification would silently exclude every account on an
	 * instance that does not send mail at all.
	 */
	const accounts = db.select({ id: user.id, banned: user.banned }).from(user).all();

	// Today's birthdays first: a row written now can be due now, and doing this
	// after the query below would delay every one of them by a minute.
	let birthdays = 0;
	let written = 0;
	for (const account of accounts) {
		if (account.banned) continue;
		const ctx = buildCtx(account.id, { now });
		birthdays += ensureBirthdayReminders(account.id, now, ctx.tz);
		// And everything else nobody types: a week left open, money with a date
		// on it, the blocks about to start, the end of the day. Written here for
		// the same reason birthdays are — the row has to exist before the minute
		// it is due, and nobody is looking at six in the morning, which is the
		// whole point. One call, because the list grows.
		written += ensureOwnReminders(ctx, now, ctx.tz);
	}

	const devices = db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).all().length;
	const summary = { accounts: accounts.length, devices, birthdays, written };

	const zones = new Map<string, string>();
	/**
	 * How late this one is, in the fewest words that are still true.
	 *
	 * Both sides are the account's own wall clock, so this is a subtraction
	 * rather than a timezone problem. Minutes below an hour because "78 minutes
	 * ago" is arithmetic somebody has to do; hours above it because by then the
	 * exact number has stopped mattering.
	 */
	const lateLabel = (was: string, now: string): string => {
		const minutes = Math.max(
			1,
			Math.round((Date.parse(`${now}Z`) - Date.parse(`${was}Z`)) / 60_000)
		);
		if (minutes < 60) return `${minutes} min late`;
		const hours = Math.round(minutes / 60);
		return `${hours}h late`;
	};

	const localFor = (userId: string) => {
		let zone = zones.get(userId);
		if (!zone) {
			zone = buildCtx(userId, { now }).tz;
			zones.set(userId, zone);
		}
		return localOfInstant(now, zone);
	};

	/*
	 * What is due is worked out before asking whether anything can be sent.
	 *
	 * Only so the two silent failures can name themselves: "no keys" and "no
	 * device signed up" are the reasons a phone stays quiet while the timer
	 * runs perfectly, and neither wrote a line anywhere. A pass with nothing
	 * due still says nothing at all — that is 1,439 minutes of most days.
	 */
	const due = pushableReminders(localFor, now);

	/*
	 * No keys is not nothing to do any more.
	 *
	 * This used to return here: without keys nothing can reach a device, so
	 * there was no point walking the list. There is now — the pass is also
	 * what writes a reminder into the list inside the app, and an instance
	 * with no push keys is exactly the instance where that list is the only
	 * way anybody finds out. Most self-hosted copies never set keys at all.
	 *
	 * So the pass runs either way. `pushToUser` records and then does nothing
	 * else, which is the right shape: one place says it, and how far it gets
	 * depends on what the instance can do.
	 */
	const configured = pushConfigured();
	if (!configured && due.length > 0) {
		say(
			`${due.length} due, and this instance has no push keys — no device can be reached, so they are the app's list and the planner`
		);
	}

	if (due.length === 0) return { ...summary, pushed: 0, due: 0, configured };

	if (configured && devices === 0) {
		say(
			`${due.length} due, and no browser on any account is signed up for notifications — turn them on in Settings, on the device that should ring`
		);
	}

	const byAccount = new Map<string, typeof due>();
	for (const reminder of due) {
		const held = byAccount.get(reminder.userId);
		if (held) held.push(reminder);
		else byAccount.set(reminder.userId, [reminder]);
	}

	let pushed = 0;
	for (const [userId, items] of byAccount) {
		for (const reminder of items) {
			/*
			 * What time it was for, and whether that has been and gone.
			 *
			 * A pass can be late — a box that was down catches up when it comes
			 * back, which is the point of `CATCH_UP_HOURS` — and a reminder that
			 * arrives an hour after the fact reading only "14:30" is a reminder
			 * somebody acts on as though it were now. It says so instead.
			 */
			const late = reminder.remindAt < localFor(userId);

			const { sent, failed } = await pushToUser(userId, {
				title: reminder.message,
				body: late
					? `${reminder.remindAt.slice(11, 16)} — ${lateLabel(reminder.remindAt, localFor(userId))}`
					: reminder.remindAt.slice(11, 16),
				url: hrefFor(reminder),
				tag: `reminder-${reminder.id}`,
				kind: 'reminder',
				// Whether this one is worth a noise, decided the same way the open
				// page decides it. A push cannot carry somebody's own ringtone —
				// nothing may play arbitrary audio from a service worker — so what
				// this buys is the device's own notification sound rather than a
				// silent arrival.
				audible: soundFor(buildCtx(userId), reminder) !== null
			});

			/*
			 * Stamped whether or not a device took it.
			 *
			 * Zero devices means this account has none signed up — and leaving the
			 * row unstamped would make it a candidate again every minute, forever,
			 * for every account that never turned notifications on. The in-app
			 * card is a separate stamp and is untouched by any of this, so nothing
			 * is lost: the reminder is still waiting on the planner.
			 */
			markPushed([reminder.id]);
			pushed += sent > 0 ? 1 : 0;
			// Said out loud: a device that keeps refusing is the difference
			// between "the timer works" and "my phone is silent", and the journal
			// is where somebody looks for that.
			for (const { device, why } of failed) {
				console.error(`reminders: ${device} did not take it — ${why}`);
			}
		}
	}

	if (devices > 0) say(`${due.length} reminder(s) due, ${pushed} delivered to at least one device`);

	return { ...summary, pushed, due: due.length, configured };
}

/**
 * What this pass did, on the minutes it did anything.
 *
 * "My phone is silent" had no trail at all: a pass that found three reminders
 * due and no device to send them to returned its counts to a caller that threw
 * them away, and wrote nothing. So the journal showed a job running every
 * minute and never showed the one fact worth knowing. Structured like every
 * other line the app writes, so `journalctl` reads the same.
 */
function say(message: string): void {
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			level: 'info',
			message: `reminders: ${message}`
		})
	);
}

/**
 * Where the notification leads.
 *
 * The same answers as `$lib/reminders.ts`, which is the browser's copy of this
 * question — kept apart rather than shared because that one resolves paths
 * through SvelteKit's router, which does not exist in a cron script.
 */
function hrefFor(reminder: { subjectKind: string; subjectId: number | null; remindAt: string }) {
	if (reminder.subjectKind === 'person' && reminder.subjectId) {
		return `/notebooks/people?person=${reminder.subjectId}`;
	}
	return `/tasks/board?date=${reminder.remindAt.slice(0, 10)}`;
}
