import { and, asc, eq } from 'drizzle-orm';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import { activities, categories } from '../../../src/lib/server/db/schema.js';
import { categoryEmoji } from '../emoji.js';

type ActivityRow = {
	name: string;
	categoryName: string;
	categoryColor: string;
	activityColor: string | null;
};

async function fetchActivities(): Promise<ActivityRow[]> {
	const userId = await getPrimaryUserId();

	return db
		.select({
			name: activities.name,
			categoryName: categories.name,
			categoryColor: categories.color,
			activityColor: activities.color
		})
		.from(activities)
		.innerJoin(categories, eq(activities.categoryId, categories.id))
		.where(and(eq(activities.userId, userId), eq(activities.active, true)))
		.orderBy(asc(categories.name), asc(activities.name))
		.all();
}

function formatActivitiesMessage(rows: ActivityRow[]): string {
	if (rows.length === 0) {
		return '🎯 Activities\n\nNo activities yet.';
	}

	const groups = new Map<string, { color: string; names: string[] }>();
	for (const row of rows) {
		if (!groups.has(row.categoryName)) {
			groups.set(row.categoryName, { color: row.categoryColor, names: [] });
		}
		groups.get(row.categoryName)!.names.push(row.name);
	}

	const lines: string[] = ['🎯 Activities', ''];
	for (const [name, group] of groups) {
		lines.push(`${categoryEmoji(group.color)} ${name}`);
		for (const activityName of group.names) {
			lines.push(`  • ${activityName}`);
		}
		lines.push('');
	}

	return lines.join('\n').trimEnd();
}

export function registerActivitiesCommand(bot: Bot<Context>): void {
	bot.command('activities', async (ctx) => {
		const rows = await fetchActivities();
		await ctx.reply(formatActivitiesMessage(rows));
	});
}
