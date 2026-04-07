import { db } from './db/index.js';
import { weeklySlots, taskInstances } from './db/schema.js';
import { eq, and, gte, lt } from 'drizzle-orm';

/** Format a Date as 'YYYY-MM-DDTHH:MM:SS' in local time (no UTC conversion). */
export function toLocalISOString(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		d.getFullYear() +
		'-' +
		pad(d.getMonth() + 1) +
		'-' +
		pad(d.getDate()) +
		'T' +
		pad(d.getHours()) +
		':' +
		pad(d.getMinutes()) +
		':' +
		pad(d.getSeconds())
	);
}

/** Get ISO 8601 week number for a date. */
export function getISOWeekNumber(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const jan4 = new Date(d.getFullYear(), 0, 4);
	return (
		1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
	);
}

/** Get the ISO week year (may differ from calendar year at year boundaries). */
export function getISOWeekYear(date: Date): number {
	const d = new Date(date);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	return d.getFullYear();
}

export function getMonday(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function formatDatetime(date: Date, time: string): string {
	const [hours, minutes] = time.split(':').map(Number);
	const d = new Date(date);
	d.setHours(hours, minutes, 0, 0);
	return toLocalISOString(d);
}

/**
 * Idempotently generate task_instances for a week from active weekly_slots.
 * Skips slots that already have an instance in the target week.
 */
export function generateWeekInstances(weekStart: Date, userId: string): number {
	const monday = getMonday(weekStart);
	const nextMonday = addDays(monday, 7);

	const mondayStr = toLocalISOString(monday);
	const nextMondayStr = toLocalISOString(nextMonday);

	const slots = db
		.select()
		.from(weeklySlots)
		.where(and(eq(weeklySlots.active, true), eq(weeklySlots.userId, userId)))
		.all();

	let created = 0;

	for (const slot of slots) {
		const scheduledDate = addDays(monday, slot.weekday);
		const scheduledAt = formatDatetime(scheduledDate, slot.startTime);

		const existing = db
			.select()
			.from(taskInstances)
			.where(
				and(
					eq(taskInstances.slotId, slot.id),
					eq(taskInstances.userId, userId),
					gte(taskInstances.scheduledAt, mondayStr),
					lt(taskInstances.scheduledAt, nextMondayStr)
				)
			)
			.all();

		if (existing.length === 0) {
			db.insert(taskInstances)
				.values({
					userId,
					slotId: slot.id,
					scheduledAt,
					status: 'pending',
					resolvedActivityId: slot.mode === 'activity' ? slot.activityId : null
				})
				.run();
			created++;
		}
	}

	return created;
}

export function generateCurrentWeek(userId: string): number {
	return generateWeekInstances(new Date(), userId);
}

export function generateNextWeek(userId: string): number {
	const nextMonday = addDays(getMonday(new Date()), 7);
	return generateWeekInstances(nextMonday, userId);
}
