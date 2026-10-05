import type { Ctx } from './ctx.js';
import { addDays, toLocalISOString } from './time.js';

// Still exported from here: the planner's callers have always found them here.
export { addDays, toLocalISOString };
import { generateInstances } from './instances.js';

/** Format a Date as 'YYYY-MM-DDTHH:MM:SS' in local time (no UTC conversion). */
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

/**
 * The first day of the week this date is in, for an account that begins its
 * week on `firstDay` — 0 for Monday through 6 for Sunday, as `settings.ts`
 * stores it.
 *
 * `getMonday` is this with `firstDay` fixed at 0, and stays because the week
 * *generator* is about the ISO week whatever anybody's preference is. What
 * moved is the review: a plan that starts on Saturday and a review keyed on
 * Monday disagreed about which week a Saturday belonged to.
 */
export function startOfWeek(date: Date, firstDay: number): Date {
	const d = new Date(date);
	// JS counts from Sunday; this app counts from Monday, like its own pickers.
	const fromMonday = (d.getDay() + 6) % 7;
	const back = (fromMonday - firstDay + 7) % 7;
	d.setDate(d.getDate() - back);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Idempotently generate instances for a week, for both kinds of block.
 *
 * The work now lives in `services/instances.ts`, which is also what reads them
 * back; this stays as the week-shaped entry point the pages already call.
 */
export function generateWeekInstances(ctx: Ctx, weekStart: Date): number {
	const monday = getMonday(weekStart);
	return generateInstances(ctx, monday, addDays(monday, 7));
}

export function generateCurrentWeek(ctx: Ctx): number {
	return generateWeekInstances(ctx, ctx.now);
}
