/**
 * Everything the app will interrupt somebody for, and the switch for each.
 *
 * These grew one at a time and each decided for itself whether to happen: the
 * review nag always did, bills always did, birthdays always did, the Monday
 * mail was a checkbox on another page, and a block could only say anything if
 * it had been given a lead time by hand. So there was no answer anywhere to
 * "what will this app tell me about", which is the first thing somebody wants
 * and the only part they can act on.
 *
 * The two rules worth pinning are that an account which has never touched any
 * of this keeps exactly what it had — a settings screen must not change
 * behaviour by appearing — and that the one key which predates the list is
 * still the key it was, because accounts have already answered it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	notifications: typeof import('../src/lib/services/notifications');
	settings: typeof import('../src/lib/services/settings');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	s = {
		notifications: await import('../src/lib/services/notifications'),
		settings: await import('../src/lib/services/settings')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-17T08:00:00'), tz: 'UTC' };
});

describe('the list itself', () => {
	test('every id in it is a row the screen can draw', () => {
		const drawn = s.notifications.notificationSettings(ctx);
		expect(drawn.map((n) => n.id).sort()).toEqual([...s.notifications.NOTIFICATION_IDS].sort());
		for (const row of drawn) {
			expect(row.label.length).toBeGreaterThan(0);
			expect(row.description.length).toBeGreaterThan(0);
		}
	});

	test('a notification with a time has one, and the rest do not', () => {
		const timed = new Set(
			s.notifications.NOTIFICATIONS.filter((n) => n.time).map((n) => n.id as string)
		);
		for (const row of s.notifications.notificationSettings(ctx)) {
			if (timed.has(row.id)) expect(row.at).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
			else expect(row.at).toBe(null);
		}
	});

	test('nothing it hands the screen is a function', () => {
		// The rows cross the wire from a load, and one function anywhere in them
		// fails the whole page with "cannot stringify a function" — which is how
		// the settings screen 500'd the first time it was opened.
		for (const row of s.notifications.notificationSettings(ctx)) {
			expect(JSON.parse(JSON.stringify(row))).toEqual(row);
		}
	});
});

describe('an account that has never answered', () => {
	test('keeps what the app already did', () => {
		// The three that always happened still happen; the two that never did
		// still do not. A settings screen that changes behaviour by appearing is
		// a settings screen nobody can trust.
		expect(s.notifications.notifies(OWNER, 'review')).toBe(true);
		expect(s.notifications.notifies(OWNER, 'bills')).toBe(true);
		expect(s.notifications.notifies(OWNER, 'birthdays')).toBe(true);
		expect(s.notifications.notifies(OWNER, 'blocks')).toBe(false);
		expect(s.notifications.notifies(OWNER, 'endOfDay')).toBe(false);
		expect(s.notifications.notifies(OWNER, 'reviewMail')).toBe(false);
	});

	test('the end of the day defaults to the last hour its planner draws', () => {
		// `end` is exclusive: a grid running to 22 draws its last hour at 21:00,
		// and the edge itself is the moment the day is already over.
		s.settings.setGridHours(OWNER, { start: 6, end: 22 });
		expect(s.notifications.notifyAt(OWNER, 'endOfDay')).toBe('21:00');

		// And for a grid that runs to midnight it is 23:00, not somebody else's
		// morning.
		s.settings.setGridHours(OWNER, { start: 6, end: 24 });
		expect(s.notifications.notifyAt(OWNER, 'endOfDay')).toBe('23:00');
	});
});

describe('answering', () => {
	test('turns one off and back on without touching the others', () => {
		s.notifications.setNotification(ctx, 'bills', { on: false });
		expect(s.notifications.notifies(OWNER, 'bills')).toBe(false);
		expect(s.notifications.notifies(OWNER, 'birthdays')).toBe(true);

		s.notifications.setNotification(ctx, 'bills', { on: true });
		expect(s.notifications.notifies(OWNER, 'bills')).toBe(true);
	});

	test('keeps the hour when the switch is thrown without one', () => {
		s.notifications.setNotification(ctx, 'endOfDay', { on: true, at: '21:30' });
		expect(s.notifications.notifyAt(OWNER, 'endOfDay')).toBe('21:30');

		// Off and on again is about whether, not about when.
		s.notifications.setNotification(ctx, 'endOfDay', { on: false });
		s.notifications.setNotification(ctx, 'endOfDay', { on: true });
		expect(s.notifications.notifyAt(OWNER, 'endOfDay')).toBe('21:30');
	});

	test('refuses an hour nobody can mean, and a notification that is not one', () => {
		expect(() =>
			s.notifications.setNotification(ctx, 'endOfDay', { on: true, at: '25:00' })
		).toThrow();
		expect(() =>
			s.notifications.setNotification(ctx, 'endOfDay', { on: true, at: 'evening' })
		).toThrow();
		expect(() => s.notifications.setNotification(ctx, 'whenever', { on: true })).toThrow();
		// And the hour that was already there survived all of that.
		expect(s.notifications.notifyAt(OWNER, 'endOfDay')).toBe('21:30');
	});

	test('the weekly mail keeps the key it had before the list existed', () => {
		// Accounts answered this when it was a checkbox on another page.
		// Renaming the key would quietly unsubscribe every one of them.
		expect(s.notifications.REVIEW_MAIL_KEY).toBe('mail.weekly-review');
		s.settings.setUserSetting(OWNER, 'mail.weekly-review', 'on');
		expect(s.notifications.notifies(OWNER, 'reviewMail')).toBe(true);
	});

	test('a notification with no time of its own cannot be given one', () => {
		expect(() => s.notifications.notifyAt(OWNER, 'bills')).toThrow();
	});
});
