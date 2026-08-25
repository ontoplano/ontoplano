import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { activities, categories, weeklySlots } from '../db/schema.js';
import { isOnboarded, markOnboarded, setTimezone, setWeekSettings } from '../settings.js';
import type { Ctx } from './ctx.js';
import { parseTimezone } from './preferences.js';
import { stamps } from './time.js';
import { ValidationError } from './errors.js';
import { num, oneOf } from './validate.js';

/**
 * First run.
 *
 * An empty grid is what a new account churns on: there is nothing to react to
 * and no example of what a block is meant to be. So the first screen asks two
 * questions it cannot guess wrong — where you are and when your week starts —
 * and offers a week to start from.
 *
 * The starter categories are deliberately not `duty / skill / money`. That is
 * the author's ontology; a stranger should meet words that mean something to
 * them and rename them later.
 */

export const TEMPLATE_KEYS = ['student', 'remote', 'blank'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

type Block = { weekday: number; startTime: string; durationMinutes: number; activity: string };

type Template = {
	key: TemplateKey;
	label: string;
	description: string;
	categories: { name: string; color: string; colorLight: string }[];
	/** Activity name → the category it belongs to. */
	activities: { name: string; category: string }[];
	blocks: Block[];
};

/** Weekdays are Monday 0 … Sunday 6, as everywhere else in the planner. */
const WEEKDAYS = [0, 1, 2, 3, 4];

/**
 * Colours are drawn from the section palette: deep enough for white text, and
 * spread by lightness as well as hue so they stay distinct without relying on
 * red versus green.
 */
const BASE_CATEGORIES = [
	{ name: 'work', color: '#1d4ed8', colorLight: '#dbeafe' },
	{ name: 'health', color: '#0f766e', colorLight: '#ccfbf1' },
	{ name: 'personal', color: '#b45309', colorLight: '#fef3c7' }
];

export const TEMPLATES: Template[] = [
	{
		key: 'student',
		label: 'Student',
		description: 'Lectures in the morning, study blocks after, exercise in between.',
		categories: BASE_CATEGORIES,
		activities: [
			{ name: 'Lectures', category: 'work' },
			{ name: 'Study block', category: 'work' },
			{ name: 'Exercise', category: 'health' },
			{ name: 'Reading', category: 'personal' }
		],
		blocks: [
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '09:00',
				durationMinutes: 120,
				activity: 'Lectures'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '14:00',
				durationMinutes: 90,
				activity: 'Study block'
			})),
			{ weekday: 1, startTime: '18:00', durationMinutes: 60, activity: 'Exercise' },
			{ weekday: 3, startTime: '18:00', durationMinutes: 60, activity: 'Exercise' },
			{ weekday: 6, startTime: '10:00', durationMinutes: 90, activity: 'Reading' }
		]
	},
	{
		key: 'remote',
		label: 'Remote worker',
		description: 'Deep work before lunch, admin after, a walk to end the day.',
		categories: BASE_CATEGORIES,
		activities: [
			{ name: 'Deep work', category: 'work' },
			{ name: 'Admin', category: 'work' },
			{ name: 'Walk', category: 'health' },
			{ name: 'Cook', category: 'personal' }
		],
		blocks: [
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '09:00',
				durationMinutes: 180,
				activity: 'Deep work'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '14:00',
				durationMinutes: 60,
				activity: 'Admin'
			})),
			...WEEKDAYS.map((weekday) => ({
				weekday,
				startTime: '17:30',
				durationMinutes: 30,
				activity: 'Walk'
			})),
			{ weekday: 5, startTime: '11:00', durationMinutes: 90, activity: 'Cook' }
		]
	},
	{
		key: 'blank',
		label: 'Blank',
		description: 'Three categories and an empty week. Fill it yourself.',
		categories: BASE_CATEGORIES,
		activities: [],
		blocks: []
	}
];

/**
 * Should this account see first run?
 *
 * The stored flag is the answer for anyone who has been through it. Accounts
 * that predate it are recognised by having a plan already: sending someone with
 * a year of history to a screen offering to seed a starter week would be worse
 * than never showing it at all.
 */
export function needsFirstRun(userId: string): boolean {
	if (isOnboarded(userId)) return false;

	const hasSlot = db
		.select({ id: weeklySlots.id })
		.from(weeklySlots)
		.where(eq(weeklySlots.userId, userId))
		.limit(1)
		.get();
	if (hasSlot) return false;

	const hasActivity = db
		.select({ id: activities.id })
		.from(activities)
		.where(eq(activities.userId, userId))
		.limit(1)
		.get();

	return !hasActivity;
}

export function templateFor(key: TemplateKey): Template {
	const found = TEMPLATES.find((t) => t.key === key);
	if (!found) throw new ValidationError('Unknown template');
	return found;
}

export type FirstRunInput = {
	timezone: unknown;
	firstDay: unknown;
	generateDay?: unknown;
	template: unknown;
};

/**
 * Everything first run decides, applied at once.
 *
 * Idempotent by construction: an account that already has categories keeps
 * them, so re-submitting cannot double-seed a week.
 */
export function completeFirstRun(ctx: Ctx, raw: FirstRunInput): TemplateKey {
	const timezone = parseTimezone(raw.timezone);
	const firstDay = num(raw.firstDay, 'first day', { int: true, min: 0, max: 6 });
	const generateDay =
		raw.generateDay === undefined || raw.generateDay === null || raw.generateDay === ''
			? 6
			: num(raw.generateDay, 'generate day', { int: true, min: 0, max: 6 });
	const key = oneOf(raw.template, 'template', TEMPLATE_KEYS);
	const template = templateFor(key);

	setTimezone(ctx.userId, timezone);
	setWeekSettings(ctx.userId, { firstDay, generateDay });

	db.transaction((tx) => {
		const existing = tx
			.select({ id: categories.id, name: categories.name })
			.from(categories)
			.where(eq(categories.userId, ctx.userId))
			.all();

		const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));

		for (const cat of template.categories) {
			if (byName.has(cat.name)) continue;
			const inserted = tx
				.insert(categories)
				.values({ userId: ctx.userId, ...cat })
				.returning({ id: categories.id })
				.get();
			byName.set(cat.name, inserted.id);
		}

		const activityIds = new Map<string, number>();
		for (const activity of template.activities) {
			const categoryId = byName.get(activity.category);
			if (!categoryId) continue;
			const inserted = tx
				.insert(activities)
				.values({
					...stamps(ctx),
					userId: ctx.userId,
					name: activity.name,
					categoryId
				})
				.returning({ id: activities.id })
				.get();
			activityIds.set(activity.name, inserted.id);
		}

		for (const block of template.blocks) {
			const activityId = activityIds.get(block.activity);
			if (!activityId) continue;
			tx.insert(weeklySlots)
				.values({
					...stamps(ctx),
					userId: ctx.userId,
					weekday: block.weekday,
					startTime: block.startTime,
					durationMinutes: block.durationMinutes,
					mode: 'activity',
					activityId,
					label: ''
				})
				.run();
		}
	});

	markOnboarded(ctx.userId);
	return key;
}

/** A zone name the browser reported, checked against what Intl actually knows. */
