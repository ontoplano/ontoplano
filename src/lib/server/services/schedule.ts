import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '../db/index.js';
import {
	activities,
	categories,
	exceptionalSlots,
	taskInstances,
	weeklySlots
} from '../db/schema.js';
import { generateWeekInstances, getMonday, toLocalISOString, addDays } from '../week-generator.js';
import type { Ctx } from './ctx.js';
import { num } from './validate.js';

/**
 * Read-only view of what's coming up.
 *
 * This is what lets an external app schedule against the plan — a-private-plugin
 * turning a "wake up 07:00 Tuesday" slot into an alarm, for instance. It is
 * deliberately read-only and deliberately generic: ontoplano exposes *what is
 * scheduled*, and the consuming app decides what to do about it. Ontoplano
 * knows nothing about alarms, ringtones, or wifi.
 */

export interface ScheduleOccurrence {
	id: string;
	source: 'slot' | 'exceptional';
	/**
	 * Local wall-clock, 'YYYY-MM-DDTHH:MM:SS', with no offset.
	 *
	 * Instants are still stored in server-local time (finding S7 — not yet
	 * migrated), so this is emitted as naive local time and the response
	 * carries the timezone separately. When S7 lands this gains a UTC `at`
	 * alongside, and `at_local` keeps its meaning.
	 */
	at_local: string;
	local_date: string;
	start_time: string;
	duration_minutes: number;
	title: string;
	category: string | null;
	label: string;
	status: string;
}

function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
	const c = new Date(d);
	c.setHours(0, 0, 0, 0);
	return c;
}

/**
 * Upcoming occurrences over the next `days` days, ordered by time.
 *
 * Includes both generated task instances (from the weekly plan) and one-off
 * exceptional slots. Suppressed slots never produce task instances, so they're
 * excluded for free.
 */
export function getUpcomingSchedule(
	ctx: Ctx,
	opts: { days?: unknown; includeCompleted?: boolean } = {}
): { timezone: string; from: string; to: string; occurrences: ScheduleOccurrence[] } {
	const days = opts.days === undefined ? 7 : num(opts.days, 'days', { min: 1, max: 31, int: true });

	const from = startOfDay(ctx.now);
	const to = addDays(from, days);

	// Materialise every week the requested range touches, not just the current
	// one. Asking for 7 days on a Sunday has to reach into next week, or an
	// alarm consumer would never learn about tomorrow. `generateWeekInstances`
	// is idempotent and skips slots that already have an instance.
	for (let week = getMonday(from); week < to; week = addDays(week, 7)) {
		generateWeekInstances(week, ctx.userId);
	}
	const fromStr = toLocalISOString(from);
	const toStr = toLocalISOString(to);

	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');

	const instances = db
		.select({
			id: taskInstances.id,
			scheduledAt: taskInstances.scheduledAt,
			status: taskInstances.status,
			duration: weeklySlots.durationMinutes,
			durationOverride: taskInstances.durationOverride,
			startTime: weeklySlots.startTime,
			label: weeklySlots.label,
			slotActivityName: slotActivities.name,
			resolvedActivityName: activities.name,
			categoryName: categories.name,
			activityCategoryName: activityCategories.name
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.leftJoin(activities, eq(taskInstances.resolvedActivityId, activities.id))
		.where(
			and(
				eq(taskInstances.userId, ctx.userId),
				gte(taskInstances.scheduledAt, fromStr),
				lt(taskInstances.scheduledAt, toStr)
			)
		)
		.orderBy(asc(taskInstances.scheduledAt))
		.all();

	const exceptionals = db
		.select({
			id: exceptionalSlots.id,
			date: exceptionalSlots.date,
			startTime: exceptionalSlots.startTime,
			duration: exceptionalSlots.durationMinutes,
			durationOverride: exceptionalSlots.durationOverride,
			status: exceptionalSlots.status,
			label: exceptionalSlots.label,
			active: exceptionalSlots.active,
			activityName: activities.name,
			categoryName: categories.name
		})
		.from(exceptionalSlots)
		.leftJoin(categories, eq(exceptionalSlots.categoryId, categories.id))
		.leftJoin(activities, eq(exceptionalSlots.activityId, activities.id))
		.where(
			and(
				eq(exceptionalSlots.userId, ctx.userId),
				gte(exceptionalSlots.date, formatDate(from)),
				lt(exceptionalSlots.date, formatDate(to))
			)
		)
		.all();

	const occurrences: ScheduleOccurrence[] = [];

	for (const t of instances) {
		const title =
			t.resolvedActivityName || t.slotActivityName || t.label || t.categoryName || 'Scheduled';
		occurrences.push({
			id: `slot:${t.id}`,
			source: 'slot',
			at_local: t.scheduledAt,
			local_date: t.scheduledAt.slice(0, 10),
			start_time: t.startTime,
			duration_minutes: t.durationOverride ?? t.duration,
			title,
			category: t.categoryName ?? t.activityCategoryName ?? null,
			label: t.label ?? '',
			status: t.status
		});
	}

	for (const e of exceptionals) {
		if (!e.active) continue;
		const atLocal = `${e.date}T${e.startTime}:00`;
		if (atLocal < fromStr || atLocal >= toStr) continue;
		occurrences.push({
			id: `exceptional:${e.id}`,
			source: 'exceptional',
			at_local: atLocal,
			local_date: e.date,
			start_time: e.startTime,
			duration_minutes: e.durationOverride ?? e.duration,
			title: e.activityName || e.label || e.categoryName || 'Scheduled',
			category: e.categoryName ?? null,
			label: e.label ?? '',
			status: e.status
		});
	}

	const filtered = opts.includeCompleted
		? occurrences
		: occurrences.filter((o) => o.status === 'pending');

	filtered.sort((a, b) => a.at_local.localeCompare(b.at_local));

	return {
		timezone: ctx.tz,
		from: fromStr,
		to: toStr,
		occurrences: filtered
	};
}
