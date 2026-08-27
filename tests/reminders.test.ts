/**
 * Something that reaches out.
 *
 * The rules worth pinning: a reminder about a block is a lead time rather than
 * a clock reading, a delivered reminder never fires twice, one that fell due
 * while the app was shut still arrives, and none of it is reachable from
 * another account.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	reminders: typeof import('../src/lib/server/services/reminders');
	slots: typeof import('../src/lib/server/services/slots');
	instances: typeof import('../src/lib/server/services/instances');
	activities: typeof import('../src/lib/server/services/activities');
	todos: typeof import('../src/lib/server/services/todos');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let later: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let block: number;

beforeAll(async () => {
	s = {
		reminders: await import('../src/lib/server/services/reminders'),
		slots: await import('../src/lib/server/services/slots'),
		instances: await import('../src/lib/server/services/instances'),
		activities: await import('../src/lib/server/services/activities'),
		todos: await import('../src/lib/server/services/todos')
	};
	// Monday 2026-08-17, 08:00.
	ctx = { userId: OWNER, now: new Date('2026-08-17T08:00:00'), tz: 'UTC' };
	later = { ...ctx, now: new Date('2026-08-17T09:00:00') };
	theirs = { ...ctx, userId: STRANGER };

	const deep = s.activities.createCategory(ctx, { name: 'Deep work', color: '#1d4ed8' });
	s.slots.createSlot(ctx, {
		weekday: 0,
		startTime: '09:00',
		durationMinutes: 60,
		mode: 'category',
		categoryId: deep,
		label: 'Write'
	});
	s.instances.generateInstances(
		ctx,
		new Date('2026-08-17T00:00:00'),
		new Date('2026-08-18T00:00:00')
	);
	block = s.instances.listForDate(ctx, new Date('2026-08-17T00:00:00'))[0].id;
});

describe('a reminder about a block', () => {
	test('is a lead time, not a clock reading', () => {
		const id = s.reminders.createReminder(ctx, {
			subjectKind: 'instance',
			subjectId: block,
			at: 10
		});

		const made = s.reminders.listReminders(ctx).find((r) => r.id === id)!;
		expect(made.remindAt).toBe('2026-08-17T08:50:00');
	});

	test('takes the block’s own name when nothing else is said', () => {
		const id = s.reminders.createReminder(ctx, {
			subjectKind: 'instance',
			subjectId: block,
			at: 30
		});
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe('Write');
	});

	test("cannot be aimed at another account's block", () => {
		expect(() =>
			s.reminders.createReminder(theirs, { subjectKind: 'instance', subjectId: block, at: 5 })
		).toThrow();
	});
});

describe('when it goes off', () => {
	test('nothing is due before its time', () => {
		expect(s.reminders.dueReminders(ctx).map((r) => r.remindAt)).toEqual([]);
	});

	test('everything overdue arrives, oldest first', () => {
		const due = s.reminders.dueReminders(later);
		expect(due.map((r) => r.remindAt)).toEqual(['2026-08-17T08:30:00', '2026-08-17T08:50:00']);
	});

	test('once delivered it never fires again', () => {
		const due = s.reminders.dueReminders(later);
		expect(
			s.reminders.markDelivered(
				later,
				due.map((r) => r.id)
			)
		).toBe(2);
		expect(s.reminders.dueReminders(later)).toEqual([]);
	});

	test('one that fell due while the app was shut still arrives', () => {
		const id = s.reminders.createReminder(ctx, {
			at: '2026-08-17T08:15',
			message: 'water the plants'
		});

		// Two hours later, with nothing having run in between.
		const muchLater = { ...ctx, now: new Date('2026-08-17T10:00:00') };
		expect(s.reminders.dueReminders(muchLater).map((r) => r.id)).toEqual([id]);
	});

	test('delivering somebody else’s reminder changes nothing', () => {
		const due = s.reminders.dueReminders({ ...ctx, now: new Date('2026-08-17T10:00:00') });
		expect(
			s.reminders.markDelivered(
				theirs,
				due.map((r) => r.id)
			)
		).toBe(0);
	});
});

describe('a reminder about nothing', () => {
	test('needs something to say', () => {
		expect(() => s.reminders.createReminder(ctx, { at: '2026-08-18T09:00' })).toThrow();
	});

	test('refuses a time it cannot read', () => {
		expect(() => s.reminders.createReminder(ctx, { at: 'tomorrow', message: 'x' })).toThrow();
	});

	test('refuses a time years away', () => {
		expect(() =>
			s.reminders.createReminder(ctx, { at: '2030-01-01T09:00', message: 'x' })
		).toThrow();
	});
});

describe('dismissing', () => {
	test('takes it off the list and stops it firing', () => {
		const id = s.reminders.createReminder(ctx, { at: '2026-08-17T07:00', message: 'already past' });
		expect(s.reminders.dismissReminder(ctx, id)).toBe(true);

		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)).toBeUndefined();
		expect(s.reminders.dueReminders(later).find((r) => r.id === id)).toBeUndefined();
	});

	test('a stranger can dismiss nothing', () => {
		const id = s.reminders.createReminder(ctx, { at: '2026-08-18T07:00', message: 'mine' });
		expect(s.reminders.dismissReminder(theirs, id)).toBe(false);
		expect(s.reminders.listReminders(ctx).some((r) => r.id === id)).toBe(true);
	});

	test('another account sees none of them at all', () => {
		expect(s.reminders.listReminders(theirs)).toEqual([]);
	});
});
