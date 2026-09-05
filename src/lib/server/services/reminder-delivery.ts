import { db } from '../db/index.js';
import { pushSubscriptions, user } from '../db/schema.js';
import { buildCtx } from './ctx.js';
import { ensureBirthdayReminders } from './birthdays.js';
import { markPushed, pushableReminders } from './reminders.js';
import { pushConfigured, pushToUser } from './push.js';
import { localOfInstant } from './time.js';

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
	for (const account of accounts) {
		if (account.banned) continue;
		const ctx = buildCtx(account.id, { now });
		birthdays += ensureBirthdayReminders(account.id, now, ctx.tz);
	}

	const devices = db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).all().length;
	const summary = { accounts: accounts.length, devices, birthdays };

	// Nothing below can do anything without keys, but the birthdays above still
	// had to be written: an instance that does not push still shows them.
	if (!pushConfigured()) return { ...summary, pushed: 0, due: 0, configured: false };

	const zones = new Map<string, string>();
	const localFor = (userId: string) => {
		let zone = zones.get(userId);
		if (!zone) {
			zone = buildCtx(userId, { now }).tz;
			zones.set(userId, zone);
		}
		return localOfInstant(now, zone);
	};

	const due = pushableReminders(localFor);
	if (due.length === 0) return { ...summary, pushed: 0, due: 0, configured: true };

	const byAccount = new Map<string, typeof due>();
	for (const reminder of due) {
		const held = byAccount.get(reminder.userId);
		if (held) held.push(reminder);
		else byAccount.set(reminder.userId, [reminder]);
	}

	let pushed = 0;
	for (const [userId, items] of byAccount) {
		for (const reminder of items) {
			const { sent, failed } = await pushToUser(userId, {
				title: reminder.message,
				body: reminder.remindAt.slice(11, 16),
				url: hrefFor(reminder),
				tag: `reminder-${reminder.id}`
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

	return { ...summary, pushed, due: due.length, configured: true };
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
