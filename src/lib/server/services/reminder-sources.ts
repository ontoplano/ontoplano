import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { reminders } from '../db/schema.js';
import { billsDueBetween } from './bills.js';
import type { Ctx } from './ctx.js';
import { reviewPending } from './review.js';
import { getGridHours } from '../settings.js';
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

		const money = bill.currency
			? `${bill.currency} ${bill.amountExpected}`
			: `${bill.amountExpected}`;

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
