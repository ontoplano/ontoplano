import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import {
	activities,
	categories,
	exceptionalTasks,
	reminders,
	ringtones,
	taskRecords,
	recurringTasks
} from '$lib/db/schema.js';
import { blockName } from '../planner-grid.js';

import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { instantOfLocal, localOfInstant, stamp } from './time.js';
import { REMINDER_LEAD_MINUTES, REMINDER_LEAD_MS } from '../reminder-window.js';
import { num, str } from './validate.js';
// The clock recomputes its sleep whenever the set of pending reminders changes;
// without this a new alarm would wait for the next ceiling tick to be noticed.
import { host } from './host.js';
import { soundFor } from './ringtones.js';
import { getGridHours } from './settings.js';

/**
 * Something that reaches out.
 *
 * The app only helps on the days you remember to open it, which is why most
 * people who try a planner stop in week two. Everything else here waits to be
 * visited; a reminder is the one thing that does not.
 *
 * ## A reminder belongs to a block, and to nothing else
 *
 * There used to be three kinds: one on an occurrence, one on a todo, and a
 * "free" one that was a message and a clock reading and nothing else. The free
 * one was a mistake — it made reminders a thing of their own, with a list of
 * their own to keep, when what anybody actually means is *tell me before this
 * starts*. So there is one kind now, and it hangs off an occurrence.
 *
 * Which also settles the todo. A todo has no time; there is nothing to be
 * before. Wanting to be reminded of one is wanting it to happen at a time —
 * give it one, which makes it a block, and the block takes the reminder.
 *
 * The lead lives on the block (`remind_lead_minutes`) and `generateForDate`
 * writes a row here per occurrence, so "ten minutes before gym" is said once
 * and applies to every gym. The rows below are those occurrences.
 *
 * Times are wall-clock, like a block's, because "remind me at ten to nine"
 * means ten to nine wherever you are. Delivery is deliberately somebody else's
 * job: a row that is due is a row anything with the database can deliver — the
 * page you have open, or the push delivery job while the app is closed.
 */

export const MAX_MESSAGE_LENGTH = 300;

/** Everything a reminder can be about, and the order the page groups them in. */
export const REMINDER_KINDS = [
	'instance',
	'todo',
	'free',
	'review',
	'bill',
	'person',
	'day'
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type Reminder = {
	id: number;
	/**
	 * `instance` for a nudge before a block, `person` for a birthday. `todo` and
	 * `free` are rows from before there was one kind — they still fire, and they
	 * drain as they are dismissed, but nothing creates another.
	 */
	/**
	 * What it is about.
	 *
	 * `free` is a reminder that is only itself — an alarm. `review` and `bill`
	 * are written by the app rather than by anybody: the week you have not
	 * closed, and money with a date on it.
	 */
	subjectKind: ReminderKind;
	subjectId: number | null;
	remindAt: string;
	message: string;
	deliveredAt: string | null;
	dismissedAt: string | null;
};

/** Now, as the wall-clock string reminders are stored in. */
export function localNow(ctx: Ctx): string {
	return localOfInstant(ctx.now, ctx.tz);
}

/** Minutes before a block starts, as the wall-clock time to fire at. */
function minutesBefore(scheduledAt: string, lead: number): string {
	const at = new Date(`${scheduledAt.slice(0, 19)}`);
	if (isNaN(at.getTime())) throw new ValidationError('That block has no time on it');
	at.setMinutes(at.getMinutes() - lead);

	const pad = (n: number) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:00`;
}

/**
 * The hour the account's day opens on, as `HH:MM`.
 *
 * Exported because the form has to say it: a field somebody may leave empty
 * has to name what leaving it empty means.
 */
export function startOfDay(userId: string): string {
	return `${String(getGridHours(userId).start).padStart(2, '0')}:00`;
}

/**
 * How much of what is coming a phone is handed, and why it is a number.
 *
 * Android holds a limited number of pending alarms per app, and the list is
 * re-booked from scratch each time anything refreshes it, so there is no value
 * in booking a year of them: what matters is that whatever is coming up soon
 * fires with the app shut. Named here rather than at each caller because every
 * consumer of this — the copy of the app on the device, and the native side
 * reading a server over the API — has to agree about it.
 */
export const AHEAD = 64;
export const AHEAD_DAYS = 30;

/**
 * What has not gone off yet and is close enough to be worth an alarm.
 *
 * One definition, used by the page that books alarms for the instance it is
 * part of and by `/api/v1/reminders/upcoming`, which hands the same list to a
 * phone pointed at a server. Two copies of this filter would be two answers to
 * "will my phone ring", and the difference would only ever show up as silence.
 */
export function upcomingReminders(
	ctx: Ctx
): { id: number; remindAt: string; at: string; message: string; audible: boolean }[] {
	/*
	 * Both ends in the account's own wall clock, which is what the rows hold.
	 *
	 * This compared them against `new Date().toISOString()` — an instant in
	 * UTC, with a Z on the end — and the comparison is a string comparison. In
	 * UTC the two happen to line up and everything worked; three hours west of
	 * it they do not, and "now" was three hours ahead of the clock the rows are
	 * written against. Everything due in the next three hours sorted as though
	 * it had already been, so it was never handed to the phone: the alarms that
	 * mattered most — the ones about to go off — were exactly the ones missing,
	 * and only for people who do not live in UTC.
	 */
	const from = localNow(ctx);
	const until = localOfInstant(new Date(ctx.now.getTime() + AHEAD_DAYS * 86_400_000), ctx.tz);

	return listReminders(ctx)
		.filter((r) => r.deliveredAt === null && r.remindAt > from && r.remindAt <= until)
		.slice(0, AHEAD)
		.map((r) => ({
			id: r.id,
			remindAt: r.remindAt,
			/*
			 * The same moment, as a moment.
			 *
			 * `remindAt` is a wall clock in the account's own zone, with no
			 * offset on the end, and everything that books an alarm from this
			 * list has to turn it into an instant. Two of them got it wrong in
			 * different ways: the shell's ringer requires a trailing `Z` and
			 * read every one of these as the epoch, so it skipped the lot and
			 * a phone pointed at a server rang for nothing at all; the copy of
			 * the app that books its own alarms parsed it as the *device's*
			 * wall clock, which is right only while the device sits in the
			 * account's zone and silently hours out when it does not.
			 *
			 * An alarm is an instant. This is that instant, so neither side
			 * has to guess — `remindAt` stays for whoever is showing it.
			 */
			at: instantOfLocal(r.remindAt, ctx.tz).toISOString(),
			message: r.message,
			audible: r.audible
		}));
}

export function listReminders(
	ctx: Ctx,
	options: { includePast?: boolean } = {}
): (Reminder & {
	/** Whether it will actually make a noise, kind and ringtone resolved. */
	audible: boolean;
	/**
	 * What this row itself says, before any of that.
	 *
	 * `audible: null` means it says nothing and follows its kind, which is what
	 * an editor has to be able to show and set back — the resolved boolean
	 * above cannot tell "silent" from "silent because bills are".
	 */
	chosen: { audible: boolean | null; ringtoneId: number | null };
})[] {
	const rows = db
		.select({
			id: reminders.id,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt,
			audible: reminders.audible,
			ringtoneId: reminders.ringtoneId
		})
		.from(reminders)
		.where(eq(reminders.userId, ctx.userId))
		.orderBy(asc(reminders.remindAt))
		.all();

	const wanted = options.includePast ? rows : rows.filter((r) => r.dismissedAt === null);

	// Whether each one will make a noise, resolved here rather than by the page:
	// it is a question about the reminder, its kind's setting and a ringtone
	// that may have been deleted, which is three tables the page cannot see.
	return wanted.map((row) => {
		const { audible, ringtoneId, ...rest } = row;
		return {
			...rest,
			audible: soundFor(ctx, { ...rest, audible, ringtoneId }) !== null,
			chosen: { audible, ringtoneId }
		};
	});
}

/**
 * Everything that should have gone off by now and has not.
 *
 * `deliveredAt` is stamped by whoever shows it, so two channels cannot both
 * announce the same thing — and one that fell due while the app was shut still
 * arrives the next time it opens, rather than being silently skipped.
 */
export function dueReminders(ctx: Ctx): (Reminder & { sound: string | null })[] {
	const rows = db
		.select({
			id: reminders.id,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt,
			audible: reminders.audible,
			ringtoneId: reminders.ringtoneId
		})
		.from(reminders)
		.where(
			and(
				eq(reminders.userId, ctx.userId),
				isNull(reminders.deliveredAt),
				isNull(reminders.dismissedAt),
				lte(reminders.remindAt, localNow(ctx))
			)
		)
		.orderBy(asc(reminders.remindAt))
		.all();

	/*
	 * The sound comes down with the reminder, resolved here rather than looked
	 * up by the page. The page's job is to play a URL; deciding whether this
	 * one is audible at all is three tables' worth of question and belongs on
	 * the side that can see them.
	 */
	return rows.map((row) => {
		const { audible, ringtoneId, ...rest } = row;
		return { ...rest, sound: soundFor(ctx, { ...rest, audible, ringtoneId })?.url ?? null };
	});
}

/**
 * A nudge before one occurrence starts.
 *
 * `at` is a lead in minutes, not a clock reading — "ten minutes before" is how
 * anybody describes a reminder about something already on a calendar, and it is
 * the only thing this takes. There is no way to make a reminder about nothing,
 * on purpose: see the note at the top of this file.
 */
/**
 * A reminder that is only itself — an alarm.
 *
 * No block, no todo, no birthday: a time and a sentence. `remind_at` carries
 * seconds here where a block's reminder carries minutes, because "seven in the
 * morning" is a moment and the clock can hit it exactly.
 */
/**
 * A day, or a day and a time, as the wall-clock string a row holds.
 *
 * "Remind me on the third" is a whole sentence, and demanding a clock reading
 * for it means picking a number that means nothing — so a bare `YYYY-MM-DD`
 * fires at the hour the planner grid opens on, which is the same hour a
 * birthday and a bill already use for exactly this reason.
 *
 * It has to be ahead of now. A reminder is a thing that is going to happen,
 * and one set for a time that has been is already due the moment it is made:
 * it fires immediately, or it sits in "already been" as something that was
 * never given. The date field said so and the server did not, so anything that
 * was not the form — an assistant reading a year off a sentence, a stale page
 * posted twice — could still write one.
 *
 * Compared as wall-clock strings in the account's own zone, which is what the
 * column holds: "at ten to nine" means ten to nine where somebody is, and
 * turning both sides into instants to compare them would import the bug that
 * storing wall-clock avoids.
 */
/**
 * A reminder the phone could not hear about in time is not a reminder.
 *
 * See `$lib/reminder-window`: the app pointed at a server learns what is
 * coming by asking, on its own clock, and anything set inside that window may
 * simply not be booked before it is due. Refusing is the honest answer —
 * accepting it would be promising a ring that depends on which device the
 * person happened to be holding.
 *
 * Wall clock on both sides, in the account's own zone, because that is what
 * the column holds and what `remindAtFrom` already compares — turning them
 * into instants to add fifteen minutes would import the bug that storing wall
 * clock avoids.
 */
function notTooSoon(ctx: Ctx, when: string): void {
	const floor = localOfInstant(new Date(ctx.now.getTime() + REMINDER_LEAD_MS), ctx.tz);
	if (when < floor) {
		throw new ValidationError(
			`Reminders have to be at least ${REMINDER_LEAD_MINUTES} minutes from now.`
		);
	}
}

function remindAtFrom(ctx: Ctx, given: unknown): string {
	const at = String(given ?? '').trim();
	const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(at);
	if (!dayOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(at)) {
		throw new ValidationError('That is not a day, or a day and a time.');
	}
	const when = dayOnly ? `${at}T${startOfDay(ctx.userId)}:00` : at.length === 16 ? `${at}:00` : at;

	if (when <= localNow(ctx)) {
		throw new ValidationError(
			dayOnly
				? `A day on its own goes off at ${startOfDay(ctx.userId)}, which has been today. Give it a time, or another day.`
				: 'That time has already been.'
		);
	}
	notTooSoon(ctx, when);
	return when;
}

/**
 * Yours or none, same as `setSoundChoice`.
 *
 * The id arrives from a form, and a sound belonging to somebody else is not a
 * sound (I1). Silently none rather than an error: the one way to reach this is
 * a stale page listing a sound that has since been deleted, and refusing to
 * save the reminder over it would lose the reminder.
 */
function ownedRingtone(ctx: Ctx, given: unknown): number | null {
	if (given === undefined || given === null || given === '') return null;
	const wanted = num(given, 'sound', { int: true, min: 1 });
	return (
		db
			.select({ id: ringtones.id })
			.from(ringtones)
			.where(and(eq(ringtones.id, wanted), eq(ringtones.userId, ctx.userId)))
			.get()?.id ?? null
	);
}

export function createFreeReminder(
	ctx: Ctx,
	raw: { at?: unknown; message?: unknown; audible?: unknown; ringtoneId?: unknown }
): number {
	const remindAt = remindAtFrom(ctx, raw.at);
	const message = str(raw.message, 'message', { max: MAX_MESSAGE_LENGTH });
	const ringtoneId = ownedRingtone(ctx, raw.ringtoneId);

	const inserted = db
		.insert(reminders)
		.values({
			userId: ctx.userId,
			subjectKind: 'free',
			subjectId: null,
			remindAt,
			message,
			// Explicitly true or false, never null: setting an alarm is saying
			// something about this one, whatever free reminders do in general.
			audible: Boolean(raw.audible),
			ringtoneId
		})
		.returning({ id: reminders.id })
		.get();

	host.reminderScheduleChanged();
	return inserted.id;
}

export function createReminder(
	ctx: Ctx,
	raw: { at?: unknown; message?: unknown; subjectId?: unknown },
	/**
	 * Whether a person chose this time, or the app worked it out.
	 *
	 * The floor is about not *promising* what cannot be kept: somebody typing
	 * "in five minutes" deserves to be told the phone may not hear in time.
	 * Nothing the app derives is a promise of that kind — a block starting
	 * soon gets a reminder because it is on the plan, and refusing to write it
	 * turns "might be a little late" into "there is none", which is worse.
	 *
	 * It also cannot be applied to the derived ones without breaking them:
	 * `ensureBlockReminders` writes for every block still ahead today,
	 * including one starting in five minutes, and a throw there takes the
	 * whole sweep with it — the page, the API and the delivery job all call
	 * it.
	 */
	{ chosen = false }: { chosen?: boolean } = {}
): number {
	const subjectId = num(raw.subjectId, 'block', { int: true, min: 1 });
	const block = ownedInstance(ctx, subjectId);
	const lead = num(raw.at, 'minutes', { int: true, min: 0, max: 24 * 60 });
	const when = minutesBefore(block.scheduledAt, lead);
	// A block five minutes away with no lead lands inside the window just as a
	// free reminder set for five minutes' time does.
	if (chosen) notTooSoon(ctx, when);

	const given = raw.message === undefined || raw.message === null ? '' : String(raw.message).trim();
	const message = given || block.title;

	// Said twice is said once. Regenerating a week must not stack four copies of
	// the same nudge onto one occurrence, and the block's lead is applied every
	// time an occurrence is made.
	const already = db
		.select({ id: reminders.id })
		.from(reminders)
		.where(
			and(
				eq(reminders.userId, ctx.userId),
				eq(reminders.subjectKind, 'instance'),
				eq(reminders.subjectId, subjectId),
				eq(reminders.remindAt, when)
			)
		)
		.get();
	if (already) return already.id;

	const inserted = db
		.insert(reminders)
		.values({
			userId: ctx.userId,
			subjectKind: 'instance',
			subjectId,
			remindAt: when,
			message: str(message, 'message', { max: MAX_MESSAGE_LENGTH })
		})
		.returning({ id: reminders.id })
		.get();

	host.reminderScheduleChanged();
	return inserted.id;
}

/** Stamped by whoever showed it, so nothing announces the same thing twice. */
export function markDelivered(ctx: Ctx, ids: number[]): number {
	let changed = 0;
	for (const id of ids) {
		if (!Number.isInteger(id) || id <= 0) continue;
		changed += db
			.update(reminders)
			.set({ deliveredAt: stamp(ctx) })
			.where(
				and(eq(reminders.id, id), eq(reminders.userId, ctx.userId), isNull(reminders.deliveredAt))
			)
			.run().changes;
	}
	return changed;
}

/**
 * Change one that is already set.
 *
 * Everything the form that made it asked for: when, what it says, whether it
 * makes a noise and which noise. Without this, a reminder was a thing you could
 * make and unmake and nothing in between — so wanting an alarm five minutes
 * later, or wanting the one you set silently to actually wake you, meant
 * deleting it and typing it again.
 *
 * Any row, not only the ones somebody typed. A nudge before a block is a real
 * row with a real time on it, and "not this one, ten minutes earlier" is the
 * commonest thing anybody wants to say about one; what it must not do is
 * change the block, which is why only these four fields are here.
 *
 * Absent fields are left alone, so a caller that only cares about the sound
 * sends the sound. `audible: null` is a real answer — it means "whatever this
 * kind of reminder does", which is what a row says before anybody overrides it.
 */
export function editReminder(
	ctx: Ctx,
	id: number,
	raw: { at?: unknown; message?: unknown; audible?: unknown; ringtoneId?: unknown }
): boolean {
	const which = num(id, 'reminder', { int: true, min: 1 });
	const change: {
		remindAt?: string;
		message?: string;
		audible?: boolean | null;
		ringtoneId?: number | null;
	} = {};

	if (raw.at !== undefined) change.remindAt = remindAtFrom(ctx, raw.at);
	if (raw.message !== undefined)
		change.message = str(raw.message, 'message', { max: MAX_MESSAGE_LENGTH });
	if (raw.audible !== undefined)
		change.audible = raw.audible === null ? null : Boolean(raw.audible);
	if (raw.ringtoneId !== undefined) change.ringtoneId = ownedRingtone(ctx, raw.ringtoneId);

	if (Object.keys(change).length === 0) return false;

	const changed =
		db
			.update(reminders)
			.set(change)
			.where(and(eq(reminders.id, which), eq(reminders.userId, ctx.userId)))
			.run().changes > 0;
	if (!changed) throw new NotFoundError('No such reminder');

	// Moving one is as much a change to the clock's next wake-up as adding one.
	host.reminderScheduleChanged();
	return true;
}

export function dismissReminder(ctx: Ctx, id: number): boolean {
	const now = stamp(ctx);
	return (
		db
			.update(reminders)
			.set({ dismissedAt: now, deliveredAt: now })
			.where(and(eq(reminders.id, id), eq(reminders.userId, ctx.userId)))
			.run().changes > 0
	);
}

export function deleteReminder(ctx: Ctx, id: number): boolean {
	const gone =
		db
			.delete(reminders)
			.where(and(eq(reminders.id, id), eq(reminders.userId, ctx.userId)))
			.run().changes > 0;
	// Removing the earliest one is as much a change to the clock's next
	// wake-up as adding one.
	if (gone) host.reminderScheduleChanged();
	return gone;
}

/** The reminders already set on one block, so its editor can show them. */
export function remindersFor(ctx: Ctx, id: number): Reminder[] {
	return listReminders(ctx).filter((r) => r.subjectKind === 'instance' && r.subjectId === id);
}

/**
 * A block's time and what it is called.
 *
 * The name is the same question the board and the grid ask — activity, then
 * the block's own label, then the category — so it goes through `blockName`
 * rather than being guessed at again here. A reminder that says "Your block"
 * is a reminder about nothing.
 */
function ownedInstance(ctx: Ctx, id: number): { scheduledAt: string; title: string } {
	const row = db
		.select({
			scheduledAt: taskRecords.scheduledAt,
			labelOverride: taskRecords.labelOverride,
			weeklyLabel: recurringTasks.label,
			weeklyMode: recurringTasks.mode,
			exceptionalLabel: exceptionalTasks.label,
			exceptionalMode: exceptionalTasks.mode,
			activityName: activities.name,
			categoryName: categories.name
		})
		.from(taskRecords)
		.leftJoin(recurringTasks, eq(taskRecords.slotId, recurringTasks.id))
		.leftJoin(exceptionalTasks, eq(taskRecords.exceptionalSlotId, exceptionalTasks.id))
		.leftJoin(
			activities,
			eq(
				activities.id,
				sql`coalesce(${taskRecords.resolvedActivityId}, ${recurringTasks.activityId}, ${exceptionalTasks.activityId})`
			)
		)
		.leftJoin(
			categories,
			eq(
				categories.id,
				sql`coalesce(${recurringTasks.categoryId}, ${exceptionalTasks.categoryId}, ${activities.categoryId})`
			)
		)
		.where(and(eq(taskRecords.id, id), eq(taskRecords.userId, ctx.userId)))
		.get();

	if (!row) throw new NotFoundError('block');

	return {
		scheduledAt: row.scheduledAt,
		title: blockName({
			mode: row.weeklyMode ?? row.exceptionalMode ?? 'category',
			activityName: row.activityName,
			label: row.labelOverride || row.weeklyLabel || row.exceptionalLabel,
			categoryName: row.categoryName
		})
	};
}

/**
 * Everything due that no device has been told about, for every account.
 *
 * The counterpart to `dueReminders`, and deliberately not the same query. That
 * one answers "what should this open page show me", is per account, and is
 * gated on `delivered_at`. This one answers "whose phone should ring", runs
 * from a job with no signed-in user, and is gated on `pushed_at` — the two
 * channels have to be able to reach the same reminder, because being at a
 * laptop is not a reason for a phone to stay quiet, and having a phone is not a
 * reason for the planner to look empty.
 *
 * Times are wall-clock in each account's own zone, so the comparison cannot be
 * done in SQL against one clock. The rows are filtered here instead: due, in
 * their own zone, and not yet pushed.
 */
/**
 * How far back a pass will still ring something.
 *
 * A box that was down for an hour should deliver that hour when it comes back
 * — a reminder told late is worth far more than one silently dropped, which is
 * what "not persistent" used to mean and never actually did. A box that was
 * down for a week should not wake somebody at four in the morning with two
 * hundred alarms about last Tuesday.
 *
 * Twelve hours is the line: long enough to cover a night's outage and an
 * afternoon's, short enough that nothing rings about a day nobody is still
 * having. Older ones are not lost — they are on the planner, which is where
 * they have been all along.
 */
export const CATCH_UP_HOURS = 12;

export function pushableReminders(
	nowByUser: (userId: string) => string,
	/**
	 * The moment the pass is working from.
	 *
	 * Both bounds below are measured from it rather than from the clock. The
	 * ceiling got away with reading `Date.now()` because it is generous in the
	 * direction that matters; the floor would not — a pass replaying an hour
	 * that has gone would have excluded the very reminders it exists to find.
	 */
	now: Date = new Date(),
	limit = 500,
	lookBackHours = CATCH_UP_HOURS
): (Reminder & { userId: string; audible: boolean | null; ringtoneId: number | null })[] {
	const rows = db
		.select({
			id: reminders.id,
			userId: reminders.userId,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt,
			// Carried so the pass can decide whether the device should make a
			// noise without a second query per reminder.
			audible: reminders.audible,
			ringtoneId: reminders.ringtoneId
		})
		.from(reminders)
		.where(
			and(
				isNull(reminders.pushedAt),
				isNull(reminders.dismissedAt),
				// A cheap ceiling in SQL before the per-zone comparison below: no
				// zone is more than a day from any other, so nothing due anywhere
				// can be past this.
				lte(reminders.remindAt, new Date(now.getTime() + 26 * 3600_000).toISOString().slice(0, 19)),
				/*
				 * And a floor, so a box that was down catches up without shouting.
				 *
				 * Everything unpushed used to be a candidate however old, which
				 * is right for an hour of downtime and wrong for a week of it:
				 * the machine comes back at four in the morning and rings two
				 * hundred alarms about times that are long gone. Inside the
				 * window they still ring — late is the point, and a missed
				 * reminder is worse than a late one. Outside it they stay on the
				 * planner, where they have been all along.
				 */
				gte(
					reminders.remindAt,
					new Date(now.getTime() - lookBackHours * 3600_000).toISOString().slice(0, 19)
				)
			)
		)
		.orderBy(asc(reminders.remindAt))
		.limit(limit)
		.all();

	return rows.filter((row) => row.remindAt <= nowByUser(row.userId));
}

/**
 * Say a reminder left for somebody's devices.
 *
 * Separate from `markDelivered` and stamping a different column — see the note
 * on the schema. Nothing here is per account: the job that calls it has no
 * signed-in user and the ids come from its own query.
 */
export function markPushed(ids: number[]): number {
	if (ids.length === 0) return 0;
	return db
		.update(reminders)
		.set({ pushedAt: sql`(CURRENT_TIMESTAMP)` })
		.where(inArray(reminders.id, ids))
		.run().changes;
}
