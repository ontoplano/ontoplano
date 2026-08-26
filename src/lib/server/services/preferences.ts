import {
	isTheme,
	setGridHours,
	setTheme,
	setStyle,
	setTimezone,
	setWeekSettings
} from '../settings.js';
import { isStyle } from '../../style.js';
import type { Ctx } from './ctx.js';
import { ValidationError } from './errors.js';
import { num, str } from './validate.js';

/**
 * The settings a person chooses about themselves.
 *
 * Thin, but here rather than in the route: these are the last four writes that
 * parsed their own input in an action, and a route that validates is a route
 * that can forget to (I2). Every value is checked against something closed —
 * a list, a range, or a timezone the platform recognises.
 */

/** Long enough for any IANA name; a bound so nothing unbounded reaches storage. */
const MAX_TIMEZONE_LENGTH = 64;

export function setUserTheme(ctx: Ctx, value: unknown): void {
	const theme = String(value ?? '');
	if (!isTheme(theme)) throw new ValidationError('Unknown theme');
	setTheme(ctx.userId, theme);
}

export function setUserStyle(ctx: Ctx, value: unknown): void {
	const style = String(value ?? '');
	if (!isStyle(style)) throw new ValidationError('Unknown style');
	setStyle(ctx.userId, style);
}

/**
 * The week, and where the user is.
 *
 * The timezone is optional here because the week can be saved without touching
 * it — first run is what captures it, and this screen is where it is corrected.
 */
export function saveWeekPreferences(
	ctx: Ctx,
	raw: { firstDay: unknown; generateDay?: unknown; timezone?: unknown }
): void {
	const firstDay = num(raw.firstDay ?? 0, 'first day', { int: true, min: 0, max: 6 });
	const generateDay = num(raw.generateDay ?? 6, 'generate day', { int: true, min: 0, max: 6 });

	const timezone = raw.timezone === undefined || raw.timezone === null ? '' : String(raw.timezone);
	if (timezone.trim()) setTimezone(ctx.userId, parseTimezone(timezone));

	setWeekSettings(ctx.userId, { firstDay, generateDay });
}

/**
 * The stretch of the day the planner grid draws.
 *
 * Whole hours, and the end has to be after the start — a grid from 18 to 6 is
 * not a short day, it is a pair of numbers that renders nothing.
 */
export function saveGridHours(ctx: Ctx, raw: { start: unknown; end: unknown }): void {
	const start = num(raw.start, 'start hour', { int: true, min: 0, max: 23 });
	const end = num(raw.end, 'end hour', { int: true, min: 1, max: 24 });

	if (end <= start) throw new ValidationError('The day has to end after it starts');

	setGridHours(ctx.userId, { start, end });
}

/** Rejected here rather than stored and thrown on every date afterwards. */
export function parseTimezone(value: unknown): string {
	const tz = str(value, 'timezone', { max: MAX_TIMEZONE_LENGTH });
	try {
		new Intl.DateTimeFormat('en-CA', { timeZone: tz });
		return tz;
	} catch {
		throw new ValidationError('Unknown timezone');
	}
}
