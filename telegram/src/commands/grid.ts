import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { activities, categories, weeklySlots } from '../../../src/lib/server/db/schema.js';
import { categoryEmoji } from '../emoji.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type SlotRow = {
	weekday: number;
	startTime: string;
	durationMinutes: number;
	mode: 'category' | 'activity';
	label: string | null;
	categoryName: string | null;
	activityName: string | null;
	color: string | null;
};

async function fetchWeek(): Promise<SlotRow[]> {
	const userId = await getPrimaryUserId();

	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');

	return db
		.select({
			weekday: weeklySlots.weekday,
			startTime: weeklySlots.startTime,
			durationMinutes: weeklySlots.durationMinutes,
			mode: weeklySlots.mode,
			label: weeklySlots.label,
			categoryName: sql<string | null>`coalesce(${categories.name}, ${activityCategories.name})`,
			activityName: slotActivities.name,
			color: sql<string | null>`coalesce(${categories.color}, ${activityCategories.color})`
		})
		.from(weeklySlots)
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.where(and(eq(weeklySlots.userId, userId), eq(weeklySlots.active, true)))
		.orderBy(asc(weeklySlots.weekday), asc(weeklySlots.startTime))
		.all() as SlotRow[];
}

function slotTitle(row: SlotRow): string {
	if (row.mode === 'activity') return row.activityName ?? row.label ?? 'Activity';
	return row.label || row.categoryName || 'Slot';
}

function formatWeekMessage(rows: SlotRow[]): string {
	const lines: string[] = ['🗓️ Weekly Grid', ''];

	for (let day = 0; day < 7; day++) {
		const daySlots = rows.filter((r) => r.weekday === day);
		if (daySlots.length === 0) continue;
		lines.push(`▸ ${WEEKDAYS[day]}`);
		for (const row of daySlots) {
			lines.push(`  ${row.startTime} ${categoryEmoji(row.color)} ${slotTitle(row)}`);
		}
		lines.push('');
	}

	if (lines.length === 2) return '🗓️ Weekly Grid\n\nNo slots planned yet.';
	return lines.join('\n').trimEnd();
}

export function registerGridCommand(bot: Bot<Context>): void {
	bot.command('grid', async (ctx) => {
		const rows = await fetchWeek();
		await ctx.reply(formatWeekMessage(rows));
	});
}
