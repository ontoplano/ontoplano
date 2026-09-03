/**
 * Preferences, and how a refused thing reaches whoever asked.
 *
 * Preferences are the one place where a bad value is stored rather than
 * rejected on the way in — a broken timezone throws on every date afterwards,
 * and a grid that ends before it starts renders nothing at all. So they are
 * refused here, at the door.
 *
 * The error mapping matters for a different reason: the same thrown error has
 * to become a form failure for a page and a JSON body for a plugin, and an
 * unexpected one must tell an API client nothing beyond "500" — database error
 * text is not something to hand out.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let preferences: typeof import('../src/lib/server/services/preferences');
let errors: typeof import('../src/lib/server/services/errors');
let settings: typeof import('../src/lib/server/settings');
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	preferences = await import('../src/lib/server/services/preferences');
	errors = await import('../src/lib/server/services/errors');
	settings = await import('../src/lib/server/settings');
	ctx = { userId: OWNER, now: new Date('2026-08-17T09:00:00'), tz: 'UTC' };
});

describe('the week', () => {
	test('is saved with the day it starts on and the day it generates', () => {
		preferences.saveWeekPreferences(ctx, { firstDay: 1, generateDay: 5 });
		const week = settings.getWeekSettings(OWNER);
		expect(week.firstDay).toBe(1);
		expect(week.generateDay).toBe(5);
	});

	test('refuses a day that is not in the week', () => {
		expect(() => preferences.saveWeekPreferences(ctx, { firstDay: 7 })).toThrow();
		expect(() => preferences.saveWeekPreferences(ctx, { firstDay: 0, generateDay: -1 })).toThrow();
	});

	test('takes a timezone when one is given, and leaves it alone when not', () => {
		preferences.saveWeekPreferences(ctx, { firstDay: 0, timezone: 'America/Sao_Paulo' });
		expect(settings.getTimezone(OWNER)).toBe('America/Sao_Paulo');

		preferences.saveWeekPreferences(ctx, { firstDay: 0 });
		expect(settings.getTimezone(OWNER)).toBe('America/Sao_Paulo');
	});
});

describe('the timezone', () => {
	test('is checked against the platform rather than stored on trust', () => {
		// Stored unchecked, it throws on every date the account ever renders.
		expect(preferences.parseTimezone('Europe/Lisbon')).toBe('Europe/Lisbon');
		expect(() => preferences.parseTimezone('Middle/Earth')).toThrow();
		expect(() => preferences.parseTimezone('')).toThrow();
	});
});

describe('the planner grid hours', () => {
	test('take whole hours', () => {
		preferences.saveGridHours(ctx, { start: 6, end: 24 });
		const hours = settings.getGridHours(OWNER);
		expect(hours.start).toBe(6);
		expect(hours.end).toBe(24);
	});

	/**
	 * An hour that was never stored is not midnight.
	 *
	 * `Number(null)` is 0 rather than NaN, so an unset end hour passed every
	 * bound check as zero, made a day that ends before it begins, and threw the
	 * *stored* start away with it. Found while giving birthday reminders the
	 * account's own first hour: the setting was there, read correctly, and
	 * discarded.
	 */
	test('a start hour on its own is still honoured', () => {
		database.exec("delete from user_settings where key like 'planner.grid_%'");
		database.exec(
			"insert into user_settings (user_id, key, value) values (?, 'planner.grid_start_hour', '5')",
			OWNER
		);

		expect(settings.getGridHours(OWNER).start).toBe(5);
	});

	test('refuse a day that ends before it starts', () => {
		// Not a short day — a pair of numbers that renders nothing.
		expect(() => preferences.saveGridHours(ctx, { start: 18, end: 6 })).toThrow();
		expect(() => preferences.saveGridHours(ctx, { start: 9, end: 9 })).toThrow();
	});

	test('refuse hours outside a day', () => {
		expect(() => preferences.saveGridHours(ctx, { start: -1, end: 12 })).toThrow();
		expect(() => preferences.saveGridHours(ctx, { start: 0, end: 25 })).toThrow();
	});
});

describe('the theme and the style', () => {
	test('take what the app knows and refuse what it does not', () => {
		expect(() => preferences.setUserTheme(ctx, 'dark')).not.toThrow();
		expect(() => preferences.setUserTheme(ctx, 'aubergine')).toThrow();
		expect(() => preferences.setUserStyle(ctx, 'sober')).not.toThrow();
		expect(() => preferences.setUserStyle(ctx, 'baroque')).toThrow();
	});
});

describe('a refusal, on its way back out', () => {
	test('keeps its status and its words for a form', () => {
		const failure = errors.toActionFailure(new errors.ConflictError('Already exists'));
		expect(failure.status).toBe(409);
		expect(failure.data.message).toBe('Already exists');
		expect(failure.data.code).toBe('conflict');
	});

	test('becomes a 400 for a form when it was a 422', () => {
		// Form actions historically use 400 for validation; client code checks
		// `form?.message` and would stop recognising a 422.
		const failure = errors.toActionFailure(new errors.ValidationError('Too long'));
		expect(failure.status).toBe(400);
	});

	test('keeps its status and its shape for a plugin', async () => {
		const response = errors.toJsonError(new errors.ForbiddenError('Insufficient scope'));
		expect(response.status).toBe(403);
		const body = await response.json();
		expect(body.error.code).toBe('forbidden');
		expect(body.error.message).toBe('Insufficient scope');
	});

	test('tells an API client nothing about an error it did not expect', async () => {
		// Database error text is not something to hand out.
		const response = errors.toJsonError(new Error('SQLITE_CONSTRAINT: users.email'));
		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error.message).toBe('Unexpected error');
		expect(JSON.stringify(body)).not.toContain('SQLITE');
	});

	test('carries the details a plan limit needs to be actionable', async () => {
		const response = errors.toJsonError(
			new errors.PlanLimitError('Too many notebooks', { limit: 3 })
		);
		expect(response.status).toBe(402);
		expect((await response.json()).error.details).toEqual({ limit: 3 });
	});

	test('says when to come back, when it is a rate limit', () => {
		const failure = errors.toActionFailure(new errors.RateLimitedError('Try again in 40s'));
		expect(failure.status).toBe(429);
		expect(failure.data.message).toContain('40s');
	});
});
