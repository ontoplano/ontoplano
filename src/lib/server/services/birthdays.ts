import { and, eq, isNotNull, like, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { people, reminders } from '../db/schema.js';
import { getGridHours } from '../settings.js';
import { localOfInstant } from './time.js';

/**
 * Being told it is somebody's birthday, on the morning of it.
 *
 * An address book that holds a birthday and says nothing on the day is an
 * address book that has the information and none of the point of it. This turns
 * the stored date into an ordinary reminder row, which means it arrives through
 * every channel reminders already arrive through — the card on the planner, the
 * notification on a phone — instead of being a fourth kind of thing that has to
 * be delivered separately.
 *
 * ## When
 *
 * The hour the account's own day starts, from the planner grid. Not a constant:
 * somebody whose day starts at five wants this at five, and being told at nine
 * that it was somebody's birthday since midnight is being told late. The same
 * reasoning as the weekly mail, and the same setting.
 *
 * ## Once
 *
 * The row is the record. A reminder for a person on a date is looked up before
 * it is written, so running this every minute, or twice, or after a restart,
 * writes one row a year per person. Dismissing it does not bring it back: the
 * check is on the date, not on the state.
 *
 * ## The year, when it is known
 *
 * "Ana turns 34 today" where the year was recorded, "Ana's birthday" where it
 * was not — which is the `--MM-DD` shape an address book needs and a date type
 * cannot hold. Nothing computes an age from a year it does not have.
 */

/** How the day is written on a reminder, from a wall-clock local time. */
function dayOf(local: string): string {
	return local.slice(0, 10);
}

/** "--03-14" from either shape of stored birthday. */
function monthDay(birthday: string): string {
	return `--${birthday.slice(-5)}`;
}

/** The age being turned, or null when the year was never recorded. */
function turning(birthday: string, onDate: string): number | null {
	if (!/^\d{4}-/.test(birthday)) return null;
	const born = Number(birthday.slice(0, 4));
	const year = Number(onDate.slice(0, 4));
	const age = year - born;
	// A birthday in the future, or one implying an implausible age, is a typo
	// rather than a fact — say the plain sentence instead of an absurd one.
	return age > 0 && age < 130 ? age : null;
}

export function birthdayMessage(name: string, birthday: string, onDate: string): string {
	const age = turning(birthday, onDate);
	return age === null ? `${name}'s birthday is today` : `${name} turns ${age} today`;
}

/**
 * Make sure today's birthdays exist as reminders for one account.
 *
 * Answers with how many rows it wrote, which is zero on all but a handful of
 * days a year. Cheap enough to call on every delivery pass and from any page
 * that is about to read reminders: one indexed query over an address book.
 */
export function ensureBirthdayReminders(userId: string, now: Date, tz: string): number {
	const local = localOfInstant(now, tz);
	const today = dayOf(local);
	const at = `${today}T${String(getGridHours(userId).start).padStart(2, '0')}:00:00`;

	const born = db
		.select({ id: people.id, name: people.name, birthday: people.birthday })
		.from(people)
		.where(
			and(
				eq(people.userId, userId),
				eq(people.remindOnBirthday, true),
				isNotNull(people.birthday),
				// Both shapes end in `-MM-DD`, so one pattern matches a birthday
				// with a year and one without.
				like(people.birthday, `%${monthDay(today).slice(1)}`)
			)
		)
		.all();

	let written = 0;
	for (const person of born) {
		if (!person.birthday) continue;

		const already = db
			.select({ id: reminders.id })
			.from(reminders)
			.where(
				and(
					eq(reminders.userId, userId),
					eq(reminders.subjectKind, 'person'),
					eq(reminders.subjectId, person.id),
					like(reminders.remindAt, `${today}%`)
				)
			)
			.get();
		if (already) continue;

		db.insert(reminders)
			.values({
				userId,
				subjectKind: 'person',
				subjectId: person.id,
				remindAt: at,
				message: birthdayMessage(person.name, person.birthday, today),
				createdAt: sql`(CURRENT_TIMESTAMP)`
			})
			.run();
		written += 1;
	}

	return written;
}
