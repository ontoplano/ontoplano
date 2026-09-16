/**
 * Something that reaches out.
 *
 * There is one kind of reminder: a nudge before a block starts. The rules worth
 * pinning are that it is a lead time rather than a clock reading, that the lead
 * lives on the block and reaches every occurrence of it, that a delivered
 * reminder never fires twice, that one which fell due while the app was shut
 * still arrives, and that none of it is reachable from another account.
 *
 * There used to be two more kinds — one on a todo, one on nothing at all — and
 * the tests for them are gone with them. A todo has no time, so there is
 * nothing to be before; see the note at the top of `services/reminders.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	reminders: typeof import('../src/lib/services/reminders');
	slots: typeof import('../src/lib/services/slots');
	instances: typeof import('../src/lib/services/instances');
	activities: typeof import('../src/lib/services/activities');
	todos: typeof import('../src/lib/services/todos');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let later: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let block: number;

beforeAll(async () => {
	s = {
		reminders: await import('../src/lib/services/reminders'),
		slots: await import('../src/lib/services/slots'),
		instances: await import('../src/lib/services/instances'),
		activities: await import('../src/lib/services/activities'),
		todos: await import('../src/lib/services/todos')
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
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 10 });

		const made = s.reminders.listReminders(ctx).find((r) => r.id === id)!;
		expect(made.remindAt).toBe('2026-08-17T08:50:00');
	});

	test('takes the block’s own name when nothing else is said', () => {
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 30 });
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe('Write');
	});

	test("cannot be aimed at another account's block", () => {
		expect(() => s.reminders.createReminder(theirs, { subjectId: block, at: 5 })).toThrow();
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
		// 45 minutes before a 09:00 block is 08:15, which is already past by the
		// time anything below runs.
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 45 });

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
	test('cannot be made at all', () => {
		// The whole of the redesign, in one assertion. A reminder is a property
		// of something on the plan; there is no way to make a free-floating one,
		// which is what left them appearing in no list anywhere.
		expect(() => s.reminders.createReminder(ctx, { at: 10 })).toThrow();
		expect(() =>
			s.reminders.createReminder(ctx, { at: 10, message: 'water the plants' })
		).toThrow();
	});

	test('and a lead nobody could mean is refused', () => {
		expect(() => s.reminders.createReminder(ctx, { subjectId: block, at: 'ten' })).toThrow();
		expect(() => s.reminders.createReminder(ctx, { subjectId: block, at: -5 })).toThrow();
		expect(() => s.reminders.createReminder(ctx, { subjectId: block, at: 60 * 25 })).toThrow();
	});

	test('the same lead twice is the same reminder, not two', () => {
		// Regenerating a week applies the block's lead again, and four copies of
		// one nudge is what that would otherwise mean.
		const first = s.reminders.createReminder(ctx, { subjectId: block, at: 20 });
		expect(s.reminders.createReminder(ctx, { subjectId: block, at: 20 })).toBe(first);
	});
});

/**
 * The lead lives on the block, and every occurrence gets its own nudge.
 *
 * This is the half that makes the feature usable: "tell me ten minutes before
 * gym" is said once, on the thing being planned, and applies to every gym —
 * rather than being set again on each occurrence as it appears.
 */
describe('a lead set on the block', () => {
	test('gives each occurrence a reminder as it appears', () => {
		const own = { ...ctx, userId: STRANGER };
		const cat = s.activities.createCategory(own, { name: 'Gym', color: '#0f766e' });
		s.slots.createSlot(own, {
			weekday: 1,
			startTime: '18:00',
			durationMinutes: 60,
			mode: 'category',
			categoryId: cat,
			label: 'Gym',
			remindLeadMinutes: 15
		});

		// Two Tuesdays.
		s.instances.generateInstances(
			own,
			new Date('2026-08-18T00:00:00'),
			new Date('2026-09-01T00:00:00')
		);

		const set = s.reminders.listReminders(own);
		expect(set.map((r) => r.remindAt)).toEqual(['2026-08-18T17:45:00', '2026-08-25T17:45:00']);
		expect(set.every((r) => r.subjectKind === 'instance')).toBe(true);
		expect(set.every((r) => r.message === 'Gym')).toBe(true);
	});

	test('and generating the same week again does not double them', () => {
		const own = { ...ctx, userId: STRANGER };
		s.instances.generateInstances(
			own,
			new Date('2026-08-18T00:00:00'),
			new Date('2026-09-01T00:00:00')
		);
		expect(s.reminders.listReminders(own)).toHaveLength(2);
	});

	test('a block with no lead gives no reminders', () => {
		const own = { ...ctx, userId: STRANGER };
		const before = s.reminders.listReminders(own).length;
		const cat = s.activities.createCategory(own, { name: 'Quiet', color: '#475569' });
		s.slots.createSlot(own, {
			weekday: 2,
			startTime: '11:00',
			durationMinutes: 30,
			mode: 'category',
			categoryId: cat
		});
		s.instances.generateInstances(
			own,
			new Date('2026-08-19T00:00:00'),
			new Date('2026-08-20T00:00:00')
		);
		expect(s.reminders.listReminders(own)).toHaveLength(before);
	});
});

describe('dismissing', () => {
	test('takes it off the list and stops it firing', () => {
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 120 });
		expect(s.reminders.dismissReminder(ctx, id)).toBe(true);

		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)).toBeUndefined();
		expect(s.reminders.dueReminders(later).find((r) => r.id === id)).toBeUndefined();
	});

	test('a stranger can dismiss nothing', () => {
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 90 });
		expect(s.reminders.dismissReminder(theirs, id)).toBe(false);
		expect(s.reminders.listReminders(ctx).some((r) => r.id === id)).toBe(true);
	});

	test('another account sees none of this one’s at all', () => {
		const mine = new Set(s.reminders.listReminders(ctx).map((r) => r.id));
		expect(s.reminders.listReminders(theirs).some((r) => mine.has(r.id))).toBe(false);
	});
});

/**
 * Changing one that is already set.
 *
 * A reminder could be made and unmade and nothing in between, so moving an
 * alarm five minutes or giving a silent one a sound meant deleting it and
 * typing it out again — a different row, a different id, and the dismissal
 * history gone with it.
 */
describe('changing a reminder', () => {
	test('moves it, rewords it, and leaves out what was not asked about', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'take the bread out'
		});

		expect(s.reminders.editReminder(ctx, id, { at: '2024-05-02T09:30' })).toBe(true);
		const moved = s.reminders.listReminders(ctx).find((r) => r.id === id)!;
		expect(moved.remindAt).toBe('2024-05-02T09:30:00');
		// Untouched by a change that was only about the time.
		expect(moved.message).toBe('take the bread out');

		s.reminders.editReminder(ctx, id, { message: 'take the loaf out' });
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe(
			'take the loaf out'
		);
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt).toBe(
			'2024-05-02T09:30:00'
		);
	});

	test('a day on its own means the hour the day starts, same as making one', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'ring mum'
		});
		s.reminders.editReminder(ctx, id, { at: '2024-06-01' });
		const at = s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt;
		expect(at.startsWith('2024-06-01T')).toBe(true);
		expect(at).not.toBe('2024-06-01');
	});

	test('silence is a third answer, not the absence of one', () => {
		// Null is the row saying nothing and following its kind; false is the row
		// saying "not this one". A boolean alone cannot tell them apart, and the
		// editor has to be able to put either back.
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'quietly',
			audible: true
		});
		const chosen = () => s.reminders.listReminders(ctx).find((r) => r.id === id)!.chosen;
		expect(chosen().audible).toBe(true);

		s.reminders.editReminder(ctx, id, { audible: false });
		expect(chosen().audible).toBe(false);

		s.reminders.editReminder(ctx, id, { audible: null });
		expect(chosen().audible).toBe(null);
	});

	test('a sound that is not yours is no sound', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'whose sound'
		});
		// No such ringtone on this account, so it lands as the default rather
		// than reaching for somebody else's row (I1).
		s.reminders.editReminder(ctx, id, { ringtoneId: 9999 });
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.chosen.ringtoneId).toBe(null);
	});

	test('a stranger can change nothing', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'mine alone'
		});
		expect(() => s.reminders.editReminder(theirs, id, { message: 'theirs now' })).toThrow();
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe('mine alone');
	});

	test('a time nobody could mean is refused, and nothing changes', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2024-05-02T09:00',
			message: 'still here'
		});
		expect(() => s.reminders.editReminder(ctx, id, { at: 'sometime' })).toThrow();
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt).toBe(
			'2024-05-02T09:00:00'
		);
	});
});
