import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import {
	activities,
	categories,
	exceptionalSlots,
	plannerTodos,
	reminders,
	taskInstances,
	weeklySlots
} from '../db/schema.js';
import { blockName } from '../../planner-grid.js';

import { localDateOf, type Ctx } from './ctx.js';
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
 * Times are wall-clock, like a block's, because "remind me at ten to nine"
 * means ten to nine wherever you are. Delivery is deliberately somebody else's
 * job: a row that is due is a row anything with the database can deliver — the
 * page you have open, and on a self-hosted box the Telegram bot, which is the
 * only channel that works while the app is closed without putting a stranger
 * in the path.
 */

export const MAX_MESSAGE_LENGTH = 300;
/** As far ahead as a reminder may be set. Beyond a year it is a diary entry. */
export const MAX_LEAD_DAYS = 366;

export type Reminder = {
	id: number;
	subjectKind: 'instance' | 'todo' | 'free';
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

function parseWhen(raw: unknown, ctx: Ctx): string {
	const value = str(raw, 'time', { max: 40 });
	// What `<input type="datetime-local">` sends, with or without seconds.
	const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/);
	if (!match) throw new ValidationError('That is not a time this understands');

	const when = `${match[1]}T${match[2]}:00`;
	const limit = new Date(ctx.now);
	limit.setDate(limit.getDate() + MAX_LEAD_DAYS);
	if (when > `${localDateOf(limit, ctx.tz)}T23:59:00`)
		throw new ValidationError(`A reminder cannot be more than ${MAX_LEAD_DAYS} days ahead`);

	return when;
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

export function createReminder(
	ctx: Ctx,
	raw: { at?: unknown; message?: unknown; subjectKind?: unknown; subjectId?: unknown }
): number {
	const kind =
		raw.subjectKind === 'instance' || raw.subjectKind === 'todo' ? raw.subjectKind : 'free';

	let subjectId: number | null = null;
	let when: string;
	let message = raw.message === undefined || raw.message === null ? '' : String(raw.message).trim();

	if (kind === 'instance') {
		subjectId = num(raw.subjectId, 'block', { int: true, min: 1 });
		const block = ownedInstance(ctx, subjectId);
		// A lead time, because "ten minutes before" is how anybody describes a
		// reminder about something already on a calendar.
		const lead = num(raw.at, 'minutes', { int: true, min: 0, max: 24 * 60 });
		when = minutesBefore(block.scheduledAt, lead);
		if (!message) message = block.title;
	} else if (kind === 'todo') {
		subjectId = num(raw.subjectId, 'todo', { int: true, min: 1 });
		const todo = db
			.select({ title: plannerTodos.title })
			.from(plannerTodos)
			.where(and(eq(plannerTodos.id, subjectId), eq(plannerTodos.userId, ctx.userId)))
			.get();
		if (!todo) throw new NotFoundError('todo');
		when = parseWhen(raw.at, ctx);
		if (!message) message = todo.title;
	} else {
		when = parseWhen(raw.at, ctx);
		if (!message) throw new ValidationError('A reminder about nothing needs something to say');
	}

	const inserted = db
		.insert(reminders)
		.values({
			userId: ctx.userId,
			subjectKind: kind,
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
export function remindersFor(ctx: Ctx, kind: 'instance' | 'todo', id: number): Reminder[] {
	return listReminders(ctx).filter((r) => r.subjectKind === kind && r.subjectId === id);
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
			scheduledAt: taskInstances.scheduledAt,
			labelOverride: taskInstances.labelOverride,
			weeklyLabel: weeklySlots.label,
			weeklyMode: weeklySlots.mode,
			exceptionalLabel: exceptionalSlots.label,
			exceptionalMode: exceptionalSlots.mode,
			activityName: activities.name,
			categoryName: categories.name
		})
		.from(taskInstances)
		.leftJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(exceptionalSlots, eq(taskInstances.exceptionalSlotId, exceptionalSlots.id))
		.leftJoin(
			activities,
			eq(
				activities.id,
				sql`coalesce(${taskInstances.resolvedActivityId}, ${weeklySlots.activityId}, ${exceptionalSlots.activityId})`
			)
		)
		.leftJoin(
			categories,
			eq(
				categories.id,
				sql`coalesce(${weeklySlots.categoryId}, ${exceptionalSlots.categoryId}, ${activities.categoryId})`
			)
		)
		.where(and(eq(taskInstances.id, id), eq(taskInstances.userId, ctx.userId)))
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
