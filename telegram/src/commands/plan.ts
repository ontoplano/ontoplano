import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Bot, Context } from 'grammy';
import { db, getPrimaryUserId } from '../db.js';
import {
	activities,
	categories,
	exceptionalSlots,
	taskInstances,
	weeklySlots
} from '../../../src/lib/server/db/schema.js';
import { categoryEmoji } from '../emoji.js';

const STATUS_EMOJI: Record<'pending' | 'completed' | 'delayed' | 'early' | 'skipped', string> = {
	pending: '⏳',
	completed: '✅',
	delayed: '⏰',
	early: '⚡',
	skipped: '⏭️'
};

type RegularTask = {
	scheduledAt: string;
	status: keyof typeof STATUS_EMOJI;
	slotMode: 'category' | 'activity';
	slotLabel: string | null;
	slotDuration: number;
	durationOverride: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	slotActivityName: string | null;
	activityName: string | null;
};

type ExceptionalTask = {
	startTime: string;
	status: keyof typeof STATUS_EMOJI;
	label: string | null;
	durationMinutes: number;
	durationOverride: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	slotActivityName: string | null;
	activityName: string | null;
};

function formatDateOnly(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toLocalISOString(date: Date): string {
	return `${formatDateOnly(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function atStartOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate() + days,
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
		date.getMilliseconds()
	);
}

function formatHeaderDate(date: Date): string {
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	}).format(date);
}

function formatDuration(minutes: number): string {
	return `${minutes}min`;
}

function extractTime(isoString: string): string {
	return isoString.slice(11, 16);
}

function getTaskTitle(task: RegularTask): string {
	if (task.slotMode === 'activity') {
		return task.activityName ?? task.slotActivityName ?? task.slotLabel ?? 'Unnamed activity';
	}

	return task.slotLabel ?? task.categoryName ?? 'Unnamed task';
}

function getExceptionalTitle(task: ExceptionalTask): string {
	return (
		task.label ??
		task.activityName ??
		task.slotActivityName ??
		task.categoryName ??
		'Unnamed special task'
	);
}

function isDone(status: keyof typeof STATUS_EMOJI): boolean {
	return status === 'completed' || status === 'delayed' || status === 'early';
}

async function fetchPlan() {
	const userId = await getPrimaryUserId();
	const today = new Date();
	const startOfDay = atStartOfDay(today);
	const startOfNextDay = addDays(startOfDay, 1);
	const selectedDate = formatDateOnly(today);
	const start = toLocalISOString(startOfDay);
	const end = toLocalISOString(startOfNextDay);

	const slotActivities = alias(activities, 'slot_activities');
	const activityCategories = alias(categories, 'activity_categories');
	const exceptionalActivities = alias(activities, 'exceptional_activities');
	const exceptionalActivityCategories = alias(categories, 'exceptional_activity_categories');
	const resolvedActivities = alias(activities, 'resolved_activities');
	const resolvedExceptionalActivities = alias(activities, 'resolved_exceptional_activities');

	const regularTasks = db
		.select({
			scheduledAt: taskInstances.scheduledAt,
			status: taskInstances.status,
			slotMode: weeklySlots.mode,
			slotLabel: weeklySlots.label,
			slotDuration: weeklySlots.durationMinutes,
			durationOverride: taskInstances.durationOverride,
			categoryName: sql<string | null>`coalesce(${categories.name}, ${activityCategories.name})`,
			categoryColor: sql<string | null>`coalesce(${categories.color}, ${activityCategories.color})`,
			slotActivityName: slotActivities.name,
			activityName: resolvedActivities.name
		})
		.from(taskInstances)
		.innerJoin(weeklySlots, eq(taskInstances.slotId, weeklySlots.id))
		.leftJoin(categories, eq(weeklySlots.categoryId, categories.id))
		.leftJoin(slotActivities, eq(weeklySlots.activityId, slotActivities.id))
		.leftJoin(activityCategories, eq(slotActivities.categoryId, activityCategories.id))
		.leftJoin(resolvedActivities, eq(taskInstances.resolvedActivityId, resolvedActivities.id))
		.where(
			and(
				eq(taskInstances.userId, userId),
				gte(taskInstances.scheduledAt, start),
				lt(taskInstances.scheduledAt, end)
			)
		)
		.orderBy(taskInstances.scheduledAt)
		.all() as RegularTask[];

	const exceptionalTasks = db
		.select({
			startTime: exceptionalSlots.startTime,
			status: exceptionalSlots.status,
			label: exceptionalSlots.label,
			durationMinutes: exceptionalSlots.durationMinutes,
			durationOverride: exceptionalSlots.durationOverride,
			categoryName: sql<
				string | null
			>`coalesce(${categories.name}, ${exceptionalActivityCategories.name})`,
			categoryColor: sql<
				string | null
			>`coalesce(${categories.color}, ${exceptionalActivityCategories.color})`,
			slotActivityName: exceptionalActivities.name,
			activityName: resolvedExceptionalActivities.name
		})
		.from(exceptionalSlots)
		.leftJoin(categories, eq(exceptionalSlots.categoryId, categories.id))
		.leftJoin(exceptionalActivities, eq(exceptionalSlots.activityId, exceptionalActivities.id))
		.leftJoin(
			exceptionalActivityCategories,
			eq(exceptionalActivities.categoryId, exceptionalActivityCategories.id)
		)
		.leftJoin(
			resolvedExceptionalActivities,
			eq(exceptionalSlots.resolvedActivityId, resolvedExceptionalActivities.id)
		)
		.where(and(eq(exceptionalSlots.userId, userId), eq(exceptionalSlots.date, selectedDate)))
		.orderBy(exceptionalSlots.startTime)
		.all() as ExceptionalTask[];

	return { today, regularTasks, exceptionalTasks };
}

function formatPlanMessage(
	tasks: RegularTask[],
	exceptionalTasks: ExceptionalTask[],
	today: Date
): string {
	const lines = [`📋 Today's Plan (${formatHeaderDate(today)})`, ''];

	for (const task of tasks) {
		const duration = task.durationOverride ?? task.slotDuration;
		const categoryPrefix = task.categoryName ? `${task.categoryName}: ` : '';
		lines.push(
			`⏰ ${extractTime(task.scheduledAt)} — ${categoryEmoji(task.categoryColor)} ${categoryPrefix}${getTaskTitle(task)} [${formatDuration(duration)}] ${STATUS_EMOJI[task.status]}`
		);
	}

	for (const task of exceptionalTasks) {
		const duration = task.durationOverride ?? task.durationMinutes;
		lines.push(
			`⏰ ${task.startTime} — ${categoryEmoji(task.categoryColor)} 🌟 Special: ${getExceptionalTitle(task)} [${formatDuration(duration)}] ${STATUS_EMOJI[task.status]}`
		);
	}

	const total = tasks.length + exceptionalTasks.length;
	const done = [
		...tasks.map((task) => task.status),
		...exceptionalTasks.map((task) => task.status)
	].filter(isDone).length;

	if (total === 0) {
		lines.push('No tasks scheduled for today.');
	} else {
		lines.push('', `Status: ${done}/${total} done`);
	}

	return lines.join('\n');
}

export function registerPlanCommand(bot: Bot<Context>): void {
	bot.command('plan', async (ctx) => {
		const { today, regularTasks, exceptionalTasks } = await fetchPlan();
		await ctx.reply(formatPlanMessage(regularTasks, exceptionalTasks, today));
	});
}
