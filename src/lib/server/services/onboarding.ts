import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { activities, categories, weeklySlots } from '../db/schema.js';
import {
	isOnboarded,
	isTheme,
	markOnboarded,
	setTheme,
	setTimezone,
	setWeekSettings
} from '../settings.js';
import type { Ctx } from './ctx.js';
import { parseTimezone } from './preferences.js';
import { clearWeeklyPlanIn } from './slots.js';
import { stamps } from './time.js';
import { ValidationError } from './errors.js';
import { num, oneOf } from './validate.js';
import {
	TEMPLATE_KEYS,
	TEMPLATES,
	type Template,
	type TemplateKey
} from './onboarding-templates.js';

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

export type { Block, Template, TemplateKey } from './onboarding-templates.js';
export { TEMPLATE_KEYS, TEMPLATES } from './onboarding-templates.js';

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
	/** Optional: first run is where the account is dressed, so it asks here. */
	theme?: unknown;
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

	setTimezone(ctx.userId, timezone);
	setWeekSettings(ctx.userId, { firstDay, generateDay });
	// Unknown or absent leaves the default, which follows the device.
	if (typeof raw.theme === 'string' && isTheme(raw.theme)) setTheme(ctx.userId, raw.theme);

	applyTemplate(ctx, key, { replacePlan: false });

	markOnboarded(ctx.userId);
	return key;
}

/**
 * Put a starter week in, whenever somebody wants one.
 *
 * These templates were only ever offered during first run, and then never seen
 * again — so somebody who skipped onboarding, or whose life changed in March,
 * had no way back to them. This is the same application, callable later.
 *
 * Everything is matched by name, so applying a template twice does not give you
 * two categories called "work" and two activities called "Study block". The
 * blocks are the exception: `replacePlan` clears the weekly plan first, because
 * merging one timetable into another produces a week that is neither.
 */
export function applyTemplate(ctx: Ctx, key: TemplateKey, options: { replacePlan: boolean }): void {
	const template = templateFor(key);

	db.transaction((tx) => {
		const byName = new Map(
			tx
				.select({ id: categories.id, name: categories.name })
				.from(categories)
				.where(eq(categories.userId, ctx.userId))
				.all()
				.map((c: { id: number; name: string }) => [c.name.toLowerCase(), c.id])
		);

		for (const cat of template.categories) {
			if (byName.has(cat.name.toLowerCase())) continue;
			const inserted = tx
				.insert(categories)
				.values({ userId: ctx.userId, ...cat })
				.returning({ id: categories.id })
				.get();
			byName.set(cat.name.toLowerCase(), inserted.id);
		}

		const activityIds = new Map<string, number>(
			tx
				.select({ id: activities.id, name: activities.name })
				.from(activities)
				.where(eq(activities.userId, ctx.userId))
				.all()
				.map((a: { id: number; name: string }) => [a.name, a.id])
		);

		for (const activity of template.activities) {
			if (activityIds.has(activity.name)) continue;
			const categoryId = byName.get(activity.category.toLowerCase());
			if (!categoryId) continue;
			const inserted = tx
				.insert(activities)
				.values({ ...stamps(ctx), userId: ctx.userId, name: activity.name, categoryId })
				.returning({ id: activities.id })
				.get();
			activityIds.set(activity.name, inserted.id);
		}

		if (options.replacePlan) clearWeeklyPlanIn(tx, ctx);

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
}

/** A zone name the browser reported, checked against what Intl actually knows. */
