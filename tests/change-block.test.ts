import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

/**
 * Moving a block, which the API could not do.
 *
 * Asked to "push the study block to four", an assistant with only add and
 * answer-for invented a move: it added a second block at 16:00 and marked the
 * original **skipped** to clear the first one off the grid. The day then
 * recorded something that had not happened — and a skip is not cosmetic, it is
 * what the weekly review asks about.
 *
 * So what these hold is the shape of an honest move: nothing is duplicated,
 * nothing gains a status it did not earn, and the repeating week is untouched.
 * Moving *this* Thursday's gym must not move gym.
 */

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let instances: typeof import('../src/lib/server/services/instances');
let slots: typeof import('../src/lib/server/services/slots');
let schedule: typeof import('../src/lib/server/services/schedule');
let activities: typeof import('../src/lib/server/services/activities');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };
let work: number;

/** A Monday, so weekday 0 is the day the clock says it is. */
const MONDAY = '2026-08-17';

beforeAll(async () => {
	instances = await import('../src/lib/server/services/instances');
	slots = await import('../src/lib/server/services/slots');
	schedule = await import('../src/lib/server/services/schedule');
	activities = await import('../src/lib/server/services/activities');
	ctx = { userId: OWNER, now: new Date(`${MONDAY}T08:00:00`), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
});

beforeEach(() => {
	for (const table of [
		'task_records',
		'suppressed_slots',
		'exceptional_tasks',
		'recurring_tasks'
	]) {
		database.exec(`delete from ${table}`);
	}
});

/** The day as anything reading the API sees it. */
const dayOf = (date = MONDAY) =>
	schedule
		.getUpcomingSchedule(ctx, { days: 7, includeCompleted: true })
		.occurrences.filter((o) => o.local_date === date);

/** A block that repeats every Monday. */
function weekly(startTime: string, minutes: number, label: string) {
	slots.createSlot(ctx, {
		weekday: 0,
		startTime,
		durationMinutes: minutes,
		mode: 'category',
		categoryId: work,
		label
	});
	instances.generateForDate(ctx, new Date(`${MONDAY}T12:00:00`));
	return dayOf().find((o) => o.title === label)!;
}

/** A block on one day only. */
function oneOff(date: string, startTime: string, minutes: number, label: string) {
	slots.createExceptional(ctx, {
		date,
		startTime,
		durationMinutes: minutes,
		mode: 'category',
		categoryId: work,
		label
	});
	return dayOf(date).find((o) => o.title === label)!;
}

describe('a one-off block', () => {
	test('moves to another hour, and is still one block', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { startTime: '16:00' });

		const day = dayOf();
		expect(day).toHaveLength(1);
		expect(day[0].start_time).toBe('16:00');
		// The thing that went wrong: a move that leaves a copy behind.
		expect(day[0].title).toBe('Study block');
	});

	test('moves to another day', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { date: '2026-08-19' });

		expect(dayOf(MONDAY)).toHaveLength(0);
		expect(dayOf('2026-08-19')).toHaveLength(1);
	});

	test('is renamed without being moved', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { title: 'Ontoplano' });

		const [only] = dayOf();
		expect(only.title).toBe('Ontoplano');
		expect(only.start_time).toBe('14:00');
		expect(only.duration_minutes).toBe(90);
	});

	test('keeps everything not being changed', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { minutes: 30 });

		const [only] = dayOf();
		expect(only.duration_minutes).toBe(30);
		expect(only.start_time).toBe('14:00');
		expect(only.title).toBe('Study block');
		expect(only.category).toBe('Work');
	});
});

describe('an occurrence of a repeating block', () => {
	test('moves within its own day without touching the pattern', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { startTime: '16:00' });

		const day = dayOf();
		expect(day).toHaveLength(1);
		expect(day[0].start_time).toBe('16:00');

		// Next Monday is still at two: pushing today's does not push the habit.
		instances.generateForDate(ctx, new Date('2026-08-24T12:00:00'));
		const next = schedule
			.getUpcomingSchedule(ctx, { days: 14, includeCompleted: true })
			.occurrences.filter((o) => o.local_date === '2026-08-24');
		expect(next[0].start_time).toBe('14:00');
	});

	test('moved to another day, it is one block on the new day and none on the old', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { date: '2026-08-19', startTime: '16:00' });

		expect(dayOf(MONDAY)).toHaveLength(0);
		const moved = dayOf('2026-08-19');
		expect(moved).toHaveLength(1);
		expect(moved[0].start_time).toBe('16:00');
	});

	/**
	 * The distinction the whole thing turns on. A move suppresses the date — "not
	 * this week" — and a skip is a status that says "I did not do it". Only the
	 * second is a fact about the person.
	 */
	test('a move never marks anything skipped', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { date: '2026-08-19' });

		const skipped = database.get(
			`select count(*) as n from task_records where status = 'skipped'`
		) as { n: number };
		expect(skipped.n, 'a move wrote a skip into the record').toBe(0);
	});

	test('renaming this one leaves the rest alone', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.changeOccurrence(ctx, block.id, { title: 'Ontoplano' });
		expect(dayOf()[0].title).toBe('Ontoplano');

		instances.generateForDate(ctx, new Date('2026-08-24T12:00:00'));
		const next = schedule
			.getUpcomingSchedule(ctx, { days: 14, includeCompleted: true })
			.occurrences.filter((o) => o.local_date === '2026-08-24');
		expect(next[0].title).toBe('Study block');
	});
});

/**
 * Renaming a block that is named by an activity.
 *
 * A block gets its name from its activity when it has one and from its label
 * otherwise, so setting a label on "deep work" changes nothing anybody can see.
 * The rename detaches the activity — and has to bring the activity's category
 * with it, because an activity block carries no category of its own. Without
 * that the service refuses with "Category required", and through the API the
 * failure was silent in the worst way: the move landed and the new name did not.
 */
describe('renaming something that was an activity', () => {
	function weeklyActivity(label: string) {
		const activity = activities.createActivity(ctx, { name: label, categoryId: work });
		slots.createSlot(ctx, {
			weekday: 0,
			startTime: '09:00',
			durationMinutes: 120,
			mode: 'activity',
			activityId: activity
		});
		instances.generateForDate(ctx, new Date(`${MONDAY}T12:00:00`));
		return dayOf().find((o) => o.title === label)!;
	}

	test('the new name is what the day shows', () => {
		const block = weeklyActivity('deep work');

		instances.changeOccurrence(ctx, block.id, { title: 'Ontoplano' });

		const day = dayOf();
		expect(day).toHaveLength(1);
		expect(day[0].title).toBe('Ontoplano');
	});

	test('and it keeps the part of life it belonged to', () => {
		const block = weeklyActivity('deep work');

		instances.changeOccurrence(ctx, block.id, { title: 'Ontoplano' });

		// The colour and the counting follow the category, and the hour was
		// still work — only which named activity it was has changed.
		expect(dayOf()[0].category).toBe('Work');
	});

	test('renaming and moving at once does both', () => {
		const block = weeklyActivity('deep work');

		instances.changeOccurrence(ctx, block.id, { title: 'Ontoplano', startTime: '16:00' });

		const [only] = dayOf();
		expect(only.title).toBe('Ontoplano');
		expect(only.start_time).toBe('16:00');
	});
});

describe('taking a block off a day', () => {
	test('a one-off is gone', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		instances.cancelOccurrence(ctx, block.id);

		expect(dayOf()).toHaveLength(0);
	});

	test('a repeating one goes from that day and no other', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.cancelOccurrence(ctx, block.id);
		expect(dayOf()).toHaveLength(0);

		instances.generateForDate(ctx, new Date('2026-08-24T12:00:00'));
		const next = schedule
			.getUpcomingSchedule(ctx, { days: 14, includeCompleted: true })
			.occurrences.filter((o) => o.local_date === '2026-08-24');
		expect(next).toHaveLength(1);
	});

	test('and it is not recorded as skipped', () => {
		const block = weekly('14:00', 90, 'Study block');

		instances.cancelOccurrence(ctx, block.id);

		const skipped = database.get(
			`select count(*) as n from task_records where status = 'skipped'`
		) as { n: number };
		expect(skipped.n, 'cancelling wrote a skip into the record').toBe(0);
	});
});

describe('what it refuses', () => {
	test('an id that is not one', () => {
		for (const bad of ['', 'nonsense', 'slot:0', 'other:3', 'slot:abc']) {
			expect(() => instances.changeOccurrence(ctx, bad, { startTime: '10:00' }), bad).toThrow();
		}
	});

	test('a call that changes nothing, rather than pretending it did', () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');
		expect(() => instances.changeOccurrence(ctx, block.id, {})).toThrow(/nothing to change/i);
	});

	/** Somebody else's block is not there, which is the same answer as not existing. */
	test("another account's block", () => {
		const block = oneOff(MONDAY, '14:00', 90, 'Study block');

		expect(() => instances.changeOccurrence(theirs, block.id, { startTime: '16:00' })).toThrow();
		expect(() => instances.cancelOccurrence(theirs, block.id)).toThrow();
		expect(dayOf()[0].start_time).toBe('14:00');
	});
});
