/**
 * Closing a week.
 *
 * The numbers were always available and nothing ever asked anybody to look at
 * them. What matters here is that the reading is honest — a week's blocks
 * counted once each, in the week they belong to — and that carrying the
 * unfinished forward cannot be told to carry somebody else's.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Services = {
	review: typeof import('../src/lib/server/services/review');
	slots: typeof import('../src/lib/server/services/slots');
	instances: typeof import('../src/lib/server/services/instances');
	activities: typeof import('../src/lib/server/services/activities');
	todos: typeof import('../src/lib/server/services/todos');
};

let s: Services;
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

/** Monday 2026-08-17, so "the week" is a fixed, known seven days. */
const MONDAY = '2026-08-17';

beforeAll(async () => {
	s = {
		review: await import('../src/lib/server/services/review'),
		slots: await import('../src/lib/server/services/slots'),
		instances: await import('../src/lib/server/services/instances'),
		activities: await import('../src/lib/server/services/activities'),
		todos: await import('../src/lib/server/services/todos')
	};
	ctx = { userId: OWNER, now: new Date('2026-08-24T09:00:00'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };

	const deep = s.activities.createCategory(ctx, { name: 'Deep work', color: '#1d4ed8' });
	const chores = s.activities.createCategory(ctx, { name: 'Chores', color: '#b45309' });

	// Three blocks a week: two deep work, one chore.
	s.slots.createSlot(ctx, {
		weekday: 0,
		startTime: '09:00',
		durationMinutes: 60,
		mode: 'category',
		categoryId: deep,
		label: 'Write'
	});
	s.slots.createSlot(ctx, {
		weekday: 2,
		startTime: '09:00',
		durationMinutes: 90,
		mode: 'category',
		categoryId: deep,
		label: 'Review'
	});
	s.slots.createSlot(ctx, {
		weekday: 4,
		startTime: '18:00',
		durationMinutes: 30,
		mode: 'category',
		categoryId: chores,
		label: 'Water the plants'
	});

	s.instances.generateInstances(
		ctx,
		new Date(MONDAY + 'T00:00:00'),
		new Date('2026-08-24T00:00:00')
	);
});

describe('what the week came to', () => {
	test('counts every block once, in the week it belongs to', () => {
		const { reading } = s.review.readWeek(ctx, MONDAY);
		expect(reading.planned).toBe(3);
		expect(reading.weekEnd).toBe('2026-08-23');
		expect(reading.minutesPlanned).toBe(180);
	});

	test('splits by category, busiest first', () => {
		const { reading } = s.review.readWeek(ctx, MONDAY);
		expect(reading.byCategory.map((c) => [c.name, c.planned])).toEqual([
			['Deep work', 2],
			['Chores', 1]
		]);
	});

	test('done blocks count as done and as minutes', () => {
		const { loose } = s.review.readWeek(ctx, MONDAY);
		s.instances.setInstanceStatus(ctx, loose[0].id, 'done');

		const { reading } = s.review.readWeek(ctx, MONDAY);
		expect(reading.done).toBe(1);
		expect(reading.unfinished).toBe(2);
		expect(reading.minutesDone).toBeGreaterThan(0);
	});

	test('a week nobody planned reads as empty rather than failing', () => {
		const { reading, loose } = s.review.readWeek(ctx, '2020-01-06');
		expect(reading.planned).toBe(0);
		expect(reading.byCategory).toEqual([]);
		expect(loose).toEqual([]);
	});
});

describe('the week is always a Monday', () => {
	test('any day inside it snaps to the same review', () => {
		const now = new Date('2026-08-24T09:00:00');
		expect(s.review.weekStartOf('2026-08-19', now)).toBe(MONDAY);
		expect(s.review.weekStartOf('2026-08-23', now)).toBe(MONDAY);
		expect(s.review.weekStartOf(MONDAY, now)).toBe(MONDAY);
	});

	test('rubbish falls back to the week containing now', () => {
		expect(s.review.weekStartOf('not-a-date', new Date('2026-08-19T09:00:00'))).toBe(MONDAY);
		expect(s.review.weekStartOf(undefined, new Date('2026-08-19T09:00:00'))).toBe(MONDAY);
	});
});

describe('three lines about the week', () => {
	test('saving, reading back, and editing in place', () => {
		s.review.saveLines(ctx, { weekStart: MONDAY, contents: ['Slow start', 'Good Thursday', ''] });
		expect(s.review.listLines(ctx, MONDAY)).toEqual([
			{ position: 1, content: 'Slow start' },
			{ position: 2, content: 'Good Thursday' }
		]);

		s.review.saveLines(ctx, {
			weekStart: MONDAY,
			contents: ['Slow start', 'Great Thursday', 'Ship it']
		});
		const lines = s.review.listLines(ctx, MONDAY);
		expect(lines).toHaveLength(3);
		expect(lines[1].content).toBe('Great Thursday');
	});

	test('emptying a box removes the line rather than storing a blank', () => {
		s.review.saveLines(ctx, { weekStart: MONDAY, contents: ['Only this', '', ''] });
		expect(s.review.listLines(ctx, MONDAY)).toEqual([{ position: 1, content: 'Only this' }]);
	});

	test("one account's lines are invisible to another", () => {
		expect(s.review.listLines(theirs, MONDAY)).toEqual([]);
	});
});

describe('carrying the unfinished forward', () => {
	test('an unfinished block becomes a todo with no day on it', () => {
		const { loose } = s.review.readWeek(ctx, MONDAY);
		const before = s.todos.listTodos(ctx).length;

		const carried = s.review.carryIntoTodos(ctx, MONDAY, [loose[0].id]);
		expect(carried).toBe(1);

		const todos = s.todos.listTodos(ctx);
		expect(todos).toHaveLength(before + 1);
		const made = todos.find((t) => t.title === loose[0].title)!;
		expect(made.scheduledDate).toBeNull();
	});

	test('a block that is already done is not on offer', () => {
		const { loose } = s.review.readWeek(ctx, MONDAY);
		expect(loose.every((l) => l.status !== 'done')).toBe(true);
	});

	test('an id from another account carries nothing and says nothing', () => {
		const { loose } = s.review.readWeek(ctx, MONDAY);
		expect(s.review.carryIntoTodos(theirs, MONDAY, [loose[0].id])).toBe(0);
		expect(s.todos.listTodos(theirs)).toEqual([]);
	});

	test('an id that is not in the week is ignored', () => {
		expect(s.review.carryIntoTodos(ctx, MONDAY, [999_999])).toBe(0);
	});
});

describe('saying what actually happened', () => {
	/*
	 * Its own week. Each answer settles a block for good now, so tests that
	 * share one week run out of blocks and start asserting nothing — which is
	 * how a suite goes green while the feature is broken.
	 */
	const OWN = '2026-08-03';

	beforeAll(() => {
		s.instances.generateInstances(
			ctx,
			new Date(OWN + 'T00:00:00'),
			new Date('2026-08-10T00:00:00')
		);
	});

	test('a block can be marked done from the review', () => {
		const { loose } = s.review.readWeek(ctx, OWN);
		const target = loose[0];

		expect(s.review.resolveLoose(ctx, OWN, [target.id], 'done')).toBe(1);

		const after = s.review.readWeek(ctx, OWN);
		expect(after.loose.some((l) => l.id === target.id)).toBe(false);
		expect(after.reading.done).toBeGreaterThan(0);
	});

	test('or skipped, which is a different fact about the week', () => {
		const { loose } = s.review.readWeek(ctx, OWN);
		const target = loose[0];

		expect(s.review.resolveLoose(ctx, OWN, [target.id], 'skipped')).toBe(1);
		expect(s.review.readWeek(ctx, OWN).reading.skipped).toBeGreaterThan(0);
	});

	test('an id from another account resolves nothing', () => {
		const { loose } = s.review.readWeek(ctx, OWN);
		if (loose.length === 0) return;

		expect(s.review.resolveLoose(theirs, OWN, [loose[0].id], 'done')).toBe(0);
		// Still open on the owner's side: the refusal changed nothing.
		expect(s.review.readWeek(ctx, OWN).loose.some((l) => l.id === loose[0].id)).toBe(true);
	});
});

/*
 * The three answers, and the rule that makes the list finite.
 *
 * Its own week, because each of these settles a block and the shared week has
 * only three.
 *
 * Every one of these failed before: the list held everything that was not
 * done, so a skipped block came back every week and the Skipped button set it
 * to what it already was. Carrying was worse — it made the todo and left the
 * block sitting there, so pressing the button twice made two todos out of one
 * block.
 */
describe('every answer takes the block out of the list', () => {
	/** The week before the shared one, generated from the same slots. */
	const EARLIER = '2026-08-10';

	beforeAll(() => {
		s.instances.generateInstances(
			ctx,
			new Date(EARLIER + 'T00:00:00'),
			new Date(MONDAY + 'T00:00:00')
		);
	});

	test('carrying it, so it cannot be carried twice', () => {
		const target = s.review.readWeek(ctx, EARLIER).loose[0];
		expect(s.review.carryIntoTodos(ctx, EARLIER, [target.id])).toBe(1);

		expect(s.review.readWeek(ctx, EARLIER).loose.map((l) => l.id)).not.toContain(target.id);

		const made = s.todos.listTodos(ctx).length;
		expect(s.review.carryIntoTodos(ctx, EARLIER, [target.id])).toBe(0);
		expect(s.todos.listTodos(ctx)).toHaveLength(made);
	});

	test('skipping it, rather than setting it to what it already is', () => {
		const target = s.review.readWeek(ctx, EARLIER).loose[0];
		expect(s.review.resolveLoose(ctx, EARLIER, [target.id], 'skipped')).toBe(1);

		expect(s.review.readWeek(ctx, EARLIER).loose.map((l) => l.id)).not.toContain(target.id);
		expect(s.review.resolveLoose(ctx, EARLIER, [target.id], 'skipped')).toBe(0);
	});

	test('and saying it was done after all', () => {
		const target = s.review.readWeek(ctx, EARLIER).loose[0];
		expect(s.review.resolveLoose(ctx, EARLIER, [target.id], 'done')).toBe(1);

		const after = s.review.readWeek(ctx, EARLIER);
		expect(after.loose.map((l) => l.id)).not.toContain(target.id);
		expect(after.reading.done).toBe(1);
	});

	test('leaving nothing behind to answer twice', () => {
		expect(s.review.readWeek(ctx, EARLIER).loose).toEqual([]);
	});
});
