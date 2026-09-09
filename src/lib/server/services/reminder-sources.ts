import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { reminders } from '../db/schema.js';
import { billsDueBetween } from './bills.js';
import type { Ctx } from './ctx.js';
import { reviewPending } from './review.js';
import { listPeople } from './people.js';
import type { ReminderKind } from './reminders.js';
import { getCurrency, getGridHours } from '../settings.js';
import { formatMoney } from '../../money.js';
import { localOfInstant } from './time.js';

/**
 * The reminders nobody types.
 *
 * A reminder somebody set is easy: they said a time and it fires. These are
 * the other kind — the things the app knows and the person does not, which is
 * the only reason to have an app that keeps them. Each one is written into the
 * ordinary reminders table well before it is due, because the row has to exist
 * for the clock to find it and nobody is looking at six in the morning.
 *
 * Every one of these is idempotent per account per day, keyed on the exact
 * row it would write, so running the pass twice cannot say a thing twice.
 * That matters more here than anywhere: the pass runs on a timer that is
 * allowed to be woken, so "twice" is the normal case and not the accident.
 */

/**
 * What a bill costs, written the way money is written.
 *
 * Amounts are integers in the currency's smallest unit — two hundred reais is
 * 20000 — because a price added up in floating point is eventually wrong in
 * front of somebody. Every screen in the app runs them through `formatMoney`;
 * these reminders did not, and said "Hedi — 20000, due 2026-09-15".
 *
 * The bill's own currency wins where it has one, and the account's is the
 * fallback: a bill recorded before the account had a currency still has an
 * amount, and "20000" is not an improvement on guessing.
 */
function priceOf(ctx: Ctx, bill: { amountExpected: number; currency: string | null }): string {
	return formatMoney(bill.amountExpected, bill.currency ?? getCurrency(ctx.userId));
}

function dayOf(local: string): string {
	return local.slice(0, 10);
}

function addDays(day: string, n: number): string {
	const d = new Date(day + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/**
 * Written once, or not at all.
 *
 * The uniqueness is (kind, subject, minute), which is the same shape
 * `createReminder` uses for blocks — so a reminder that already exists for
 * this thing at this moment is left alone rather than duplicated, whatever
 * woke the pass.
 */
function writeOnce(
	userId: string,
	kind: 'review' | 'bill',
	subjectId: number | null,
	at: string,
	message: string
): boolean {
	const already = db
		.select({ id: reminders.id })
		.from(reminders)
		.where(
			and(
				eq(reminders.userId, userId),
				eq(reminders.subjectKind, kind),
				subjectId === null ? eq(reminders.subjectId, -1) : eq(reminders.subjectId, subjectId),
				eq(reminders.remindAt, at)
			)
		)
		.get();
	if (already) return false;

	db.insert(reminders)
		.values({
			userId,
			subjectKind: kind,
			// -1 rather than null: null never equals null in SQL, so a null subject
			// would make the check above find nothing and write a row every pass.
			subjectId: subjectId ?? -1,
			remindAt: at,
			message
		})
		.run();
	return true;
}

/**
 * "Your weekly review is pending."
 *
 * Once, on the morning of the day the week turns over, and only while there is
 * actually something to review — `reviewPending` already refuses to ask about
 * a week nobody planned. Said again the following week if it is still open,
 * because the number in it will have changed and so will the sentence.
 */
export function ensureReviewReminder(ctx: Ctx, now: Date, tz: string): number {
	const pending = reviewPending(ctx);
	if (!pending) return 0;

	const today = dayOf(localOfInstant(now, tz));
	const at = `${today}T${String(getGridHours(ctx.userId).start).padStart(2, '0')}:00:00`;

	const message =
		pending.weeks > 1
			? `${pending.weeks} weeks are still waiting to be reviewed — the oldest has ${pending.planned} blocks in it.`
			: `Your weekly review is pending — ${pending.planned} blocks last week.`;

	return writeOnce(ctx.userId, 'review', null, at, message) ? 1 : 0;
}

/**
 * The three things worth saying about a bill.
 *
 * They are three different sentences because they are three different
 * situations, and one of them is an emergency:
 *
 *   - the day it should be paid, which is the due day minus whatever lead the
 *     bill carries — "today is the day for paying this";
 *   - any day after that while it is still unpaid — "you still have to pay
 *     this", which is the one that stops a bill being forgotten quietly;
 *   - the due day itself, which is the last day it can be paid at all.
 *
 * Only for bills that are actually unpaid, and only inside a fortnight, so a
 * year's worth of yearly bills is not written into the table in advance.
 */
export function ensureBillReminders(ctx: Ctx, now: Date, tz: string): number {
	const today = dayOf(localOfInstant(now, tz));
	const hour = String(getGridHours(ctx.userId).start).padStart(2, '0');

	// A fortnight back for the ones already overdue, a fortnight on for the
	// ones about to be.
	const due = billsDueBetween(ctx, addDays(today, -14), addDays(today, 14));
	let written = 0;

	for (const bill of due) {
		if (bill.paid) continue;

		const money = priceOf(ctx, bill);

		if (bill.date === today) {
			// The day it wants paying. If that is also the due day, the sharper
			// sentence below is the one that gets written.
			if (bill.dueDate !== today) {
				written += writeOnce(
					ctx.userId,
					'bill',
					bill.billId,
					`${today}T${hour}:00:00`,
					`Today is the day for paying ${bill.name} — ${money}.`
				)
					? 1
					: 0;
			}
		}

		if (bill.dueDate === today) {
			written += writeOnce(
				ctx.userId,
				'bill',
				bill.billId,
				`${today}T${hour}:00:00`,
				`Careful — ${bill.name} is due today. ${money}.`
			)
				? 1
				: 0;
			continue;
		}

		// Past the day it should have been paid and still not paid. Said once a
		// day rather than once: a bill you have forgotten is forgotten again
		// tomorrow, and the point of this one is that it keeps asking.
		if (bill.date < today && bill.dueDate >= today) {
			written += writeOnce(
				ctx.userId,
				'bill',
				bill.billId,
				`${today}T${hour}:00:00`,
				`You still have to pay ${bill.name} — ${money}, due ${bill.dueDate}.`
			)
				? 1
				: 0;
		}
	}

	return written;
}

/**
 * What is coming, that is not a row yet.
 *
 * A reminder exists in the table only once it is nearly due — a birthday is
 * written on the morning, a bill on the day it wants paying. That is right for
 * delivering them and wrong for showing somebody what is ahead, which is what
 * a page called Reminders is for. So the page asks for both: the rows that
 * exist, and these, worked out on the spot and never stored.
 *
 * Derived rather than materialised on purpose. Writing sixty days of birthdays
 * into the table would make the list right and the delivery wrong — every one
 * of them would fire the moment it was written, because "due" is only a
 * comparison against the clock.
 */
export type Upcoming = {
	kind: ReminderKind;
	/** Local wall-clock, the same shape a stored reminder carries. */
	at: string;
	message: string;
};

/**
 * How far ahead the page looks, and how far it is allowed to.
 *
 * Two months by default, which covers a birthday you can still do something
 * about. A year is the ceiling: past that every yearly bill appears twice and
 * the list stops being about what is coming.
 */
export const UPCOMING_DAYS = 60;
export const MAX_UPCOMING_DAYS = 365;

/** A window somebody asked for, clamped to something the list can be. */
export function upcomingWindow(raw: unknown): number {
	const days = Math.trunc(Number(raw));
	if (!Number.isFinite(days) || days < 1) return UPCOMING_DAYS;
	return Math.min(days, MAX_UPCOMING_DAYS);
}

export function upcomingDerived(ctx: Ctx, now: Date, tz: string, days = UPCOMING_DAYS): Upcoming[] {
	const today = dayOf(localOfInstant(now, tz));
	const hour = String(getGridHours(ctx.userId).start).padStart(2, '0');
	const out: Upcoming[] = [];

	// Birthdays, from the address book rather than from anything stored.
	for (const person of listPeople(ctx)) {
		if (!person.birthday || !person.remindOnBirthday) continue;
		const day = nextOccurrenceOf(person.birthday, today);
		if (day === null || daysBetween(today, day) > days) continue;
		out.push({
			kind: 'person',
			at: `${day}T${hour}:00:00`,
			// Not `birthdayMessage`, which ends in "today" — true of the reminder
			// that fires on the morning, and a lie in a list of what is coming.
			// The row carries the date already, so the sentence does not need one.
			message: comingBirthday(person.name, person.birthday, day)
		});
	}

	// Bills that want paying, up to the same horizon.
	for (const bill of billsDueBetween(ctx, today, addDays(today, days))) {
		if (bill.paid) continue;
		const money = priceOf(ctx, bill);
		out.push({
			kind: 'bill',
			at: `${bill.date}T${hour}:00:00`,
			message: `${bill.name} — ${money}, due ${bill.dueDate}`
		});
	}

	return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * "Ana turns 34", for a birthday that has not happened yet.
 *
 * `birthdayMessage` says "today", which is what the reminder firing on the
 * morning should say and exactly wrong in a list of things that are coming —
 * every future birthday claimed to be today's. The age is still worth saying,
 * because it is the part somebody cannot work out at a glance.
 */
function comingBirthday(name: string, birthday: string, on: string): string {
	const born = Number(birthday.slice(0, 4));
	const year = Number(on.slice(0, 4));
	const age = /^\d{4}-/.test(birthday) ? year - born : null;
	return age !== null && age > 0 && age < 130 ? `${name} turns ${age}` : `${name}'s birthday`;
}

/** The next time a `MM-DD` or `YYYY-MM-DD` birthday comes round, on or after a day. */
function nextOccurrenceOf(birthday: string, onOrAfter: string): string | null {
	const monthDay = birthday.slice(-5);
	if (!/^\d{2}-\d{2}$/.test(monthDay)) return null;
	const thisYear = `${onOrAfter.slice(0, 4)}-${monthDay}`;
	if (thisYear >= onOrAfter) return thisYear;
	return `${Number(onOrAfter.slice(0, 4)) + 1}-${monthDay}`;
}

function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
