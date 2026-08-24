import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { activities, categories, weeklySlots } from '../db/schema.js';
import type { Ctx } from './ctx.js';

/**
 * The weekly plan: the blocks that repeat.
 *
 * What they produce on a given day is `services/instances.ts`; this is the
 * standing shape of a week.
 */

export function listActiveWeeklySlots(ctx: Ctx) {
	return db
		.select({
			id: weeklySlots.id,
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			durationMinutes: weeklySlots.durationMinutes,
			mode: weeklySlots.mode,
			label: weeklySlots.label,
			activityName: activities.name,
			categoryName: categories.name,
			categoryColor: categories.color
		})
		.from(weeklySlots)
		.leftJoin(activities, eq(weeklySlots.activityId, activities.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.where(and(eq(weeklySlots.userId, ctx.userId), eq(weeklySlots.active, true)))
		.orderBy(weeklySlots.startTime)
		.all();
}
