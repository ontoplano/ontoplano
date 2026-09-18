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
			at: '2026-09-02T09:00',
			message: 'take the bread out'
		});

		expect(s.reminders.editReminder(ctx, id, { at: '2026-09-02T09:30' })).toBe(true);
		const moved = s.reminders.listReminders(ctx).find((r) => r.id === id)!;
		expect(moved.remindAt).toBe('2026-09-02T09:30:00');
		// Untouched by a change that was only about the time.
		expect(moved.message).toBe('take the bread out');

		s.reminders.editReminder(ctx, id, { message: 'take the loaf out' });
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe(
			'take the loaf out'
		);
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt).toBe(
			'2026-09-02T09:30:00'
		);
	});

	test('a day on its own means the hour the day starts, same as making one', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-09-02T09:00',
			message: 'ring mum'
		});
		s.reminders.editReminder(ctx, id, { at: '2026-10-01' });
		const at = s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt;
		expect(at.startsWith('2026-10-01T')).toBe(true);
		expect(at).not.toBe('2026-10-01');
	});

	test('silence is a third answer, not the absence of one', () => {
		// Null is the row saying nothing and following its kind; false is the row
		// saying "not this one". A boolean alone cannot tell them apart, and the
		// editor has to be able to put either back.
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-09-02T09:00',
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
			at: '2026-09-02T09:00',
			message: 'whose sound'
		});
		// No such ringtone on this account, so it lands as the default rather
		// than reaching for somebody else's row (I1).
		s.reminders.editReminder(ctx, id, { ringtoneId: 9999 });
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.chosen.ringtoneId).toBe(null);
	});

	test('a stranger can change nothing', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-09-02T09:00',
			message: 'mine alone'
		});
		expect(() => s.reminders.editReminder(theirs, id, { message: 'theirs now' })).toThrow();
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.message).toBe('mine alone');
	});

	test('a time nobody could mean is refused, and nothing changes', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-09-02T09:00',
			message: 'still here'
		});
		expect(() => s.reminders.editReminder(ctx, id, { at: 'sometime' })).toThrow();
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt).toBe(
			'2026-09-02T09:00:00'
		);
	});
});

/**
 * A reminder is about something that has not happened yet.
 *
 * One set for a time that has been is due the instant it exists: it fires
 * immediately, or it goes straight into "already been" as something that was
 * never given. The date field said so and the service did not, so anything
 * that was not the form — an assistant reading a year off a sentence, a stale
 * page posted twice — could still write one.
 */
describe('a time that has already been', () => {
	test('cannot be set, and cannot be moved to', () => {
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17T07:59', message: 'a minute ago' })
		).toThrow();
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2020-01-01T09:00', message: 'years ago' })
		).toThrow();

		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-17T09:00',
			message: 'in an hour'
		});
		expect(() => s.reminders.editReminder(ctx, id, { at: '2026-08-17T07:00' })).toThrow();
		// And the reminder is where it was, rather than half-changed.
		expect(s.reminders.listReminders(ctx).find((r) => r.id === id)!.remindAt).toBe(
			'2026-08-17T09:00:00'
		);
	});

	test('a day whose opening hour has been is refused, not quietly moved', () => {
		// A bare day means the hour the account's day starts. Asked for today at
		// eight in the morning, with a day that opens at six, that hour has gone
		// — and silently firing it now, or tomorrow, are both answers nobody
		// asked for.
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17', message: 'today, sometime' })
		).toThrow();

		// Tomorrow is a whole sentence and still works.
		expect(
			s.reminders.createFreeReminder(ctx, { at: '2026-08-18', message: 'tomorrow' })
		).toBeGreaterThan(0);
	});

	/*
	 * Two refusals, not one, and they are not the same refusal.
	 *
	 * This used to read "the minute it is due is still ahead; the minute after
	 * is not", and prove it by accepting 08:01. A minute out is now refused for
	 * a different reason — the phone could not be told in time — which hides
	 * the boundary this test is about behind a nearer one.
	 *
	 * So both are asserted by what they say. A time in the past is a mistake
	 * about the past; a time too close is a promise this cannot keep. Somebody
	 * typing either deserves to be told which.
	 */
	test('is refused for having been, not for being close', () => {
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17T08:00', message: 'exactly now' })
		).toThrow(/already been/);
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17T08:01', message: 'a minute out' })
		).toThrow(/15 minutes/);
	});
});

/**
 * What a phone is handed to book with Android.
 *
 * This is the whole of how a reminder arrives on an instance that runs on the
 * device: there is no server to wake it, so the app hands the next few weeks to
 * the system while it is open. The list is therefore the feature — an empty
 * one is silence, and silence is indistinguishable from "nothing was due".
 *
 * It compared wall-clock rows against `new Date().toISOString()`, which is an
 * instant in UTC with a Z on the end, as strings. In UTC the two line up by
 * accident; three hours west they do not, and everything due in the next three
 * hours sorted as already past. The alarms about to go off were exactly the
 * ones never booked, and only for people who do not live in UTC.
 */
describe('what is handed to a phone to book', () => {
	/** The same account, read from a timezone that is not UTC. */
	const west = { userId: OWNER, now: new Date('2026-08-17T08:00:00Z'), tz: 'America/Sao_Paulo' };

	test('includes the next few hours, west of UTC', () => {
		// 05:00 local is 08:00Z: this is set for an hour and a half from now.
		const id = s.reminders.createFreeReminder(west, {
			at: '2026-08-17T06:30',
			message: 'within the hour'
		});

		const upcoming = s.reminders.upcomingReminders(west);
		expect(upcoming.some((r) => r.id === id)).toBe(true);
	});

	test('and still leaves out what has been', () => {
		const id = s.reminders.createFreeReminder(west, {
			at: '2026-08-17T06:00',
			message: 'an hour out'
		});
		// An hour later, the same reminder is not something still to come.
		const after = { ...west, now: new Date('2026-08-17T10:00:00Z') };
		expect(s.reminders.upcomingReminders(after).some((r) => r.id === id)).toBe(false);
	});

	test('and stops at the window it promises', () => {
		const far = s.reminders.createFreeReminder(west, {
			at: '2026-12-25T09:00',
			message: 'months away'
		});
		expect(s.reminders.upcomingReminders(west).some((r) => r.id === far)).toBe(false);
	});
});

/**
 * A reminder the phone could not hear about in time is not a reminder.
 *
 * The app pointed at a server has no way to be told: the page it shows belongs
 * to that server, and the shell's bridge reaches only the copy the phone
 * carries. So the phone finds out by asking, on its own clock, and anything
 * set inside that window may simply not be booked before it is due.
 *
 * The form refuses it too, but the form is not the only way in — an assistant
 * over MCP, a stale page posted twice, a script. This is the rule holding
 * where it has to.
 */
describe('a time too soon for the phone to hear about', () => {
	test('is refused, however it is asked for', () => {
		// now is 08:00; the floor is 08:15.
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17T08:05', message: 'five minutes' })
		).toThrow(/15 minutes/);
		expect(() =>
			s.reminders.createFreeReminder(ctx, { at: '2026-08-17T08:14', message: 'one minute short' })
		).toThrow(/15 minutes/);
	});

	test('and the edge is allowed, because a floor is a floor', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-17T08:15',
			message: 'exactly the floor'
		});
		expect(id).toBeGreaterThan(0);
	});

	test('nor can one be moved into the window', () => {
		const id = s.reminders.createFreeReminder(ctx, {
			at: '2026-08-17T18:00',
			message: 'this evening'
		});
		expect(() => s.reminders.editReminder(ctx, id, { at: '2026-08-17T08:05' })).toThrow(
			/15 minutes/
		);
		// And it is where it was, rather than half-moved.
		const still = s.reminders.listReminders(ctx, { includePast: true }).find((r) => r.id === id);
		expect(still?.remindAt.slice(0, 16)).toBe('2026-08-17T18:00');
	});

	test('a day on its own is judged by the hour it would fire at', () => {
		// The account's day starts long before 08:15, so today-with-no-time is
		// already gone rather than merely too soon — but it must not slip
		// through as "no time given, nothing to check".
		expect(() => s.reminders.createFreeReminder(ctx, { at: '2026-08-17' })).toThrow();
	});
});

/**
 * The floor is on what a person asks for, not on what the app works out.
 *
 * Somebody typing "in five minutes" is owed the truth: the phone may not hear
 * in time. A block starting in five minutes is a different thing entirely —
 * the person scheduled the block, the reminder is a courtesy, and refusing to
 * write it turns "might be a little late" into "there is none".
 *
 * It is also the difference between working and not. `ensureBlockReminders`
 * writes for every block still ahead today, and a throw in there takes the
 * whole sweep with it — the reminders page, the API and the delivery job all
 * call it, so one block starting soon would have stopped birthdays, bills and
 * the weekly review from being written at all.
 */
describe('who is making the promise', () => {
	test('a derived reminder is written however close it is', () => {
		// The block is at 09:00 and now is 08:00, so a 50-minute lead lands at
		// 08:10 — inside the floor.
		const id = s.reminders.createReminder(ctx, { subjectId: block, at: 50 });
		expect(id).toBeGreaterThan(0);
	});

	test('and the same reminder is refused when somebody chose the time', () => {
		expect(() =>
			s.reminders.createReminder(ctx, { subjectId: block, at: 51 }, { chosen: true })
		).toThrow(/15 minutes/);
	});

	test('the whole sweep survives a block starting inside the window', () => {
		// The regression this guards: one soon block used to abort everything
		// nobody types — birthdays, bills, the review, the end of the day.
		expect(() => s.reminders.createReminder(ctx, { subjectId: block, at: 55 })).not.toThrow();
	});
});
