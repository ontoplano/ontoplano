import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	categories,
	exceptionalTasks,
	reminders,
	taskRecords,
	recurringTasks
} from '../db/schema.js';
import { blockName } from '../../planner-grid.js';

import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { localOfInstant, stamp } from './time.js';
import { num, str } from './validate.js';

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

export type Reminder = {
	id: number;
	/**
	 * `instance` for a nudge before a block, `person` for a birthday. `todo` and
	 * `free` are rows from before there was one kind — they still fire, and they
	 * drain as they are dismissed, but nothing creates another.
	 */
	subjectKind: 'instance' | 'todo' | 'free' | 'person';
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

export function listReminders(ctx: Ctx, options: { includePast?: boolean } = {}): Reminder[] {
	const rows = db
		.select({
			id: reminders.id,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt
		})
		.from(reminders)
		.where(eq(reminders.userId, ctx.userId))
		.orderBy(asc(reminders.remindAt))
		.all();

	return options.includePast ? rows : rows.filter((r) => r.dismissedAt === null);
}

/**
 * Everything that should have gone off by now and has not.
 *
 * `deliveredAt` is stamped by whoever shows it, so two channels cannot both
 * announce the same thing — and one that fell due while the app was shut still
 * arrives the next time it opens, rather than being silently skipped.
 */
export function dueReminders(ctx: Ctx): Reminder[] {
	return db
		.select({
			id: reminders.id,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt
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
}

/**
 * A nudge before one occurrence starts.
 *
 * `at` is a lead in minutes, not a clock reading — "ten minutes before" is how
 * anybody describes a reminder about something already on a calendar, and it is
 * the only thing this takes. There is no way to make a reminder about nothing,
 * on purpose: see the note at the top of this file.
 */
export function createReminder(
	ctx: Ctx,
	raw: { at?: unknown; message?: unknown; subjectId?: unknown }
): number {
	const subjectId = num(raw.subjectId, 'block', { int: true, min: 1 });
	const block = ownedInstance(ctx, subjectId);
	const lead = num(raw.at, 'minutes', { int: true, min: 0, max: 24 * 60 });
	const when = minutesBefore(block.scheduledAt, lead);

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
	return (
		db
			.delete(reminders)
			.where(and(eq(reminders.id, id), eq(reminders.userId, ctx.userId)))
			.run().changes > 0
	);
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
export function pushableReminders(
	nowByUser: (userId: string) => string,
	limit = 500
): (Reminder & { userId: string })[] {
	const rows = db
		.select({
			id: reminders.id,
			userId: reminders.userId,
			subjectKind: reminders.subjectKind,
			subjectId: reminders.subjectId,
			remindAt: reminders.remindAt,
			message: reminders.message,
			deliveredAt: reminders.deliveredAt,
			dismissedAt: reminders.dismissedAt
		})
		.from(reminders)
		.where(
			and(
				isNull(reminders.pushedAt),
				isNull(reminders.dismissedAt),
				// A cheap ceiling in SQL before the per-zone comparison below: no
				// zone is more than a day from any other, so nothing due anywhere
				// can be past this.
				lte(reminders.remindAt, new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 19))
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
