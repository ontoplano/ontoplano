/**
 * A task's attributes, and the notebook a task block is filed under.
 *
 * Attributes were `meta` on a block until 0.184 and nothing at all on a todo.
 * They are the same shape on both now, and the promise that matters is that
 * they travel: a todo put on the plan becomes a block that still says what the
 * todo said, and a block pulled back to the list becomes a todo that does. The
 * same for the notebook — scheduling something must not take it out of the
 * subject it belongs to, whichever direction it is going.
 *
 * And the ownership predicate on both new writes: a stranger's id is the same
 * answer as no id at all.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let todos: typeof import('../src/lib/services/todos');
let slots: typeof import('../src/lib/services/slots');
let notebooks: typeof import('../src/lib/services/notebooks');
let activities: typeof import('../src/lib/services/activities');
let schedule: typeof import('../src/lib/services/schedule');
let attrs: typeof import('../src/lib/services/task-attributes');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let ctx: ReturnType<typeof import('../src/lib/services/ctx').buildCtx>;
let theirs: typeof ctx;
let work: number;
let kitchen: number;

beforeAll(async () => {
	({ buildCtx } = await import('../src/lib/services/ctx'));
	todos = await import('../src/lib/services/todos');
	slots = await import('../src/lib/services/slots');
	notebooks = await import('../src/lib/services/notebooks');
	activities = await import('../src/lib/services/activities');
	schedule = await import('../src/lib/services/schedule');
	attrs = await import('../src/lib/services/task-attributes');
	ctx = { ...buildCtx(OWNER, { tz: 'UTC' }), now: new Date('2026-09-21T09:00:00Z') };
	theirs = { ...ctx, userId: STRANGER };
	work = activities.createCategory(ctx, { name: 'Work', color: '#1d4ed8' });
	kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen' });
});

const todo = (id: number) => todos.listTodos(ctx).find((one) => one.id === id)!;
const oneOff = (id: number) =>
	slots.listExceptionals(ctx, '2026-01-01', '2027-01-01').find((one) => one.id === id)!;
const weekly = (id: number) => slots.listWeeklySlots(ctx).find((one) => one.id === id)!;

describe('one attribute changed in place', () => {
	test('sets, replaces and removes a single key, leaving the rest', () => {
		const start = JSON.stringify({ url: 'https://a.example', room: 'B12' });
		expect(JSON.parse(attrs.withAttribute(start, 'room', 'C3'))).toEqual({
			url: 'https://a.example',
			room: 'C3'
		});
		expect(JSON.parse(attrs.withAttribute(start, 'room', ''))).toEqual({
			url: 'https://a.example'
		});
		expect(JSON.parse(attrs.withAttribute('{}', 'order', '42'))).toEqual({ order: '42' });
	});

	test('refuses a name a plugin could not read', () => {
		expect(() => attrs.withAttribute('{}', 'not a key', 'x')).toThrow();
	});
});

describe('the old spelling, from an API or MCP caller', () => {
	test('`attributes` wins over `meta` when both are sent', () => {
		expect(attrs.attributesArg({ attributes: { a: '1' }, meta: { b: '2' } })).toEqual({
			value: { a: '1' },
			usedMeta: false
		});
	});

	test('`meta` alone is read, and says it was', () => {
		expect(attrs.attributesArg({ meta: { b: '2' } })).toEqual({
			value: { b: '2' },
			usedMeta: true
		});
	});

	test('neither is "leave them alone"', () => {
		expect(attrs.attributesArg({})).toEqual({ value: undefined, usedMeta: false });
	});
});

describe("a todo's attributes", () => {
	test('are kept when it is made, and read back parsed', () => {
		const id = todos.createTodo(ctx, {
			title: 'order tiles',
			attributes: { url: 'https://t.example' }
		});
		expect(todo(id).attributes).toEqual({ url: 'https://t.example' });
	});

	test('are left alone by an edit that says nothing about them', () => {
		const id = todos.createTodo(ctx, { title: 'grout', attributes: { colour: 'grey' } });
		todos.updateTodo(ctx, id, { title: 'grout the splashback' });
		expect(todo(id).attributes).toEqual({ colour: 'grey' });
	});

	test('are replaced by one that does, and cleared by an empty set', () => {
		const id = todos.createTodo(ctx, { title: 'seal', attributes: { a: '1' } });
		todos.updateTodo(ctx, id, { title: 'seal', attributes: { b: '2' } });
		expect(todo(id).attributes).toEqual({ b: '2' });
		todos.updateTodo(ctx, id, { title: 'seal', attributes: {} });
		expect(todo(id).attributes).toEqual({});
	});

	test('are validated the way a block’s are', () => {
		expect(() => todos.createTodo(ctx, { title: 'x', attributes: { '9lives': 'x' } })).toThrow();
	});

	test('change one at a time, and a stranger cannot', () => {
		const id = todos.createTodo(ctx, { title: 'plumber', attributes: { phone: '555' } });
		todos.setTodoAttribute(ctx, id, 'phone', '556');
		expect(todo(id).attributes).toEqual({ phone: '556' });

		// Not theirs and not there are the same answer.
		expect(() => todos.setTodoAttribute(theirs, id, 'phone', 'mine now')).toThrow(/not found/i);
		expect(() => todos.setTodoAttribute(ctx, 999_999, 'phone', 'x')).toThrow(/not found/i);
		expect(todo(id).attributes).toEqual({ phone: '556' });
	});
});

describe('putting a todo on the plan and taking it back', () => {
	test('carries the attributes and the notebook onto the block and back', () => {
		const id = todos.createTodo(ctx, {
			title: 'measure the worktop',
			notebookId: kitchen,
			attributes: { tape: '5m' }
		});
		expect(todos.promoteTodo(ctx, { todoId: id, date: '2026-09-22', startTime: '10:00' }).ok).toBe(
			true
		);

		const block = slots
			.listExceptionals(ctx, '2026-09-22', '2026-09-23')
			.find((one) => one.label === 'measure the worktop')!;
		expect(block.notebookId).toBe(kitchen);
		expect(block.notebookTitle).toBe('Kitchen');
		expect(JSON.parse(block.attributes)).toEqual({ tape: '5m' });

		const { todoId } = todos.demoteToTodo(ctx, block.id);
		expect(todo(todoId).notebookId).toBe(kitchen);
		expect(todo(todoId).attributes).toEqual({ tape: '5m' });
	});
});

describe('a task block in a notebook', () => {
	test('a one-off is filed when made, moved, and left alone by a drag', () => {
		const id = slots.createExceptional(ctx, {
			date: '2026-09-23',
			startTime: '09:00',
			mode: 'category',
			categoryId: work,
			label: 'order the sink',
			notebookId: kitchen
		});
		expect(oneOff(id).notebookId).toBe(kitchen);

		// A drag posts placement only: the notebook stays.
		slots.updateExceptional(ctx, id, {
			date: '2026-09-24',
			startTime: '11:00',
			mode: 'category',
			categoryId: work,
			label: 'order the sink'
		});
		expect(oneOff(id).notebookId).toBe(kitchen);

		// The form says "none": it leaves.
		slots.updateExceptional(ctx, id, {
			date: '2026-09-24',
			startTime: '11:00',
			mode: 'category',
			categoryId: work,
			label: 'order the sink',
			notebookId: ''
		});
		expect(oneOff(id).notebookId).toBeNull();
	});

	test('a repeating one too, and it keeps both when it becomes a one-off', () => {
		const id = slots.createSlot(ctx, {
			weekday: 0,
			startTime: '08:00',
			mode: 'category',
			categoryId: work,
			label: 'check the damp',
			notebookId: kitchen,
			attributes: attrs.serialiseAttributes({ room: 'utility' })
		});
		expect(weekly(id).notebookId).toBe(kitchen);
		expect(
			notebooks.contentsOf(ctx, kitchen).blocks.some((b) => b.kind === 'weekly' && b.id === id)
		).toBe(true);

		slots.convertRepeat(ctx, id, { to: 'once', date: '2026-09-28' });
		const moved = slots
			.listExceptionals(ctx, '2026-09-28', '2026-09-29')
			.find((one) => one.label === 'check the damp')!;
		expect(moved.notebookId).toBe(kitchen);
		expect(JSON.parse(moved.attributes)).toEqual({ room: 'utility' });
	});

	test('cannot be filed in a stranger’s notebook', () => {
		const theirNotebook = notebooks.createNotebook(theirs, { title: 'Their garage' });
		expect(() =>
			slots.createSlot(ctx, {
				weekday: 1,
				startTime: '08:00',
				mode: 'category',
				categoryId: work,
				notebookId: theirNotebook
			})
		).toThrow();
	});
});

describe('the schedule a plugin reads', () => {
	test('answers with `attributes`, keeps `meta` for now, and says so', () => {
		slots.createExceptional(ctx, {
			date: '2026-09-21',
			startTime: '20:00',
			mode: 'category',
			categoryId: work,
			label: 'alarm test',
			attributes: attrs.serialiseAttributes({ alarm: 'true' })
		});
		const answer = schedule.getUpcomingSchedule(ctx, { days: 1 });
		const one = answer.occurrences.find((o) => o.label === 'alarm test')!;
		expect(one.attributes).toEqual({ alarm: 'true' });
		expect(one.meta).toEqual({ alarm: 'true' });
		expect(answer.warning).toContain(attrs.META_REMOVED_IN);
	});
});
