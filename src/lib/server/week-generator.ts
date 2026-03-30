import { db } from './db/index.js';
import { weeklySlots, taskInstances } from './db/schema.js';
import { eq, and, gte, lt } from 'drizzle-orm';

function getMonday(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1);
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function formatDatetime(date: Date, time: string): string {
	const [hours, minutes] = time.split(':').map(Number);
	const d = new Date(date);
	d.setHours(hours, minutes, 0, 0);
	return d.toISOString().replace('Z', '').slice(0, 19);
}

/**
 * Idempotently generate task_instances for a week from active weekly_slots.
 * Skips slots that already have an instance in the target week.
 */
export function generateWeekInstances(weekStart: Date): number {
	const monday = getMonday(weekStart);
	const nextMonday = addDays(monday, 7);

	const mondayStr = monday.toISOString().slice(0, 19);
	const nextMondayStr = nextMonday.toISOString().slice(0, 19);

	const slots = db.select().from(weeklySlots).where(eq(weeklySlots.active, true)).all();

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
					gte(taskInstances.scheduledAt, mondayStr),
					lt(taskInstances.scheduledAt, nextMondayStr)
				)
			)
			.all();

		if (existing.length === 0) {
			db.insert(taskInstances)
				.values({
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

export function generateCurrentWeek(): number {
	return generateWeekInstances(new Date());
}

export function generateNextWeek(): number {
	const nextMonday = addDays(getMonday(new Date()), 7);
	return generateWeekInstances(nextMonday);
}
