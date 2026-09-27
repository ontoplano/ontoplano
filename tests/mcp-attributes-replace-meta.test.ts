/**
 * Attributes over MCP: on a todo, on a task block, and under their old name.
 *
 * A block's key/value pairs were `meta` until 0.184. An assistant written
 * against that still gets its pairs stored — translated rather than refused —
 * and is told in the answer which release stops reading the old name, the way
 * `energy` became `ease`. And a block can be filed in a notebook from here,
 * since whatever the app lets a person do, an assistant can.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let todos: typeof import('../src/lib/services/todos');
let slots: typeof import('../src/lib/services/slots');
let notebooks: typeof import('../src/lib/services/notebooks');
let activities: typeof import('../src/lib/services/activities');
let META_REMOVED_IN: string;
let ctx: ReturnType<typeof buildCtx>;
let kitchen: number;

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ META_REMOVED_IN } = await import('../src/lib/services/task-attributes'));
	todos = await import('../src/lib/services/todos');
	slots = await import('../src/lib/services/slots');
	notebooks = await import('../src/lib/services/notebooks');
	activities = await import('../src/lib/services/activities');
	ctx = buildCtx(OWNER, { tz: 'UTC' });
	activities.createCategory(ctx, { name: 'Home', color: '#1d4ed8' });
	kitchen = notebooks.createNotebook(ctx, { title: 'Kitchen' });
});

type Answer = { id?: number; ok?: boolean; warning?: string };

function call(tool: string, args: Record<string, unknown>): Answer {
	const answer = handleBody(
		{
			ctx,
			scopes: ['tasks:read', 'tasks:write', 'schedule:read', 'schedule:write', 'notebooks:read']
		} as never,
		{
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: tool, arguments: args }
		}
	) as { result?: { isError?: boolean; structuredContent?: Answer }; error?: unknown };
	expect(answer.error, JSON.stringify(answer)).toBeUndefined();
	expect(answer.result?.isError, JSON.stringify(answer.result)).toBeFalsy();
	return answer.result?.structuredContent ?? {};
}

const todo = (id: number) => todos.listTodos(ctx).find((one) => one.id === id)!;

describe('a todo’s attributes', () => {
	test('are written by add_task and replaced by change_task', () => {
		const { id, warning } = call('add_task', {
			title: 'book the electrician',
			attributes: { phone: '555-0100' }
		});
		expect(warning).toBeUndefined();
		expect(todo(id!).attributes).toEqual({ phone: '555-0100' });

		call('change_task', { id, attributes: { phone: '555-0101', quote: '£240' } });
		expect(todo(id!).attributes).toEqual({ phone: '555-0101', quote: '£240' });

		// Left out, untouched.
		call('change_task', { id, title: 'book the electrician for Tuesday' });
		expect(todo(id!).attributes).toEqual({ phone: '555-0101', quote: '£240' });

		call('change_task', { id, attributes: {} });
		expect(todo(id!).attributes).toEqual({});
	});

	test('are read back by `tasks` when there are any', () => {
		const { id } = call('add_task', { title: 'return the drill', attributes: { shop: 'B&Q' } });
		const answer = handleBody({ ctx, scopes: ['tasks:read'] } as never, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'tasks', arguments: { verbose: true } }
		}) as { result?: { structuredContent?: { items?: { id: number; attributes?: unknown }[] } } };
		const row = answer.result?.structuredContent?.items?.find((one) => one.id === id);
		expect(row?.attributes).toEqual({ shop: 'B&Q' });
	});
});

describe('a caller still sending `meta`', () => {
	test('has it stored as attributes, and is told which release removes it', () => {
		const { id, warning } = call('add_task', { title: 'old caller', meta: { room: 'B12' } });
		expect(todo(id!).attributes).toEqual({ room: 'B12' });
		expect(warning).toContain('`meta` is deprecated');
		expect(warning).toContain(META_REMOVED_IN);
	});

	test('on a repeating block too', () => {
		const { id, warning } = call('add_repeating_block', {
			weekday: 2,
			start_time: '07:00',
			title: 'bins',
			meta: { alarm: 'true' }
		});
		const block = slots.listWeeklySlots(ctx).find((one) => one.id === id)!;
		expect(JSON.parse(block.attributes)).toEqual({ alarm: 'true' });
		expect(warning).toContain(META_REMOVED_IN);
	});

	test('and `attributes` wins where a caller sends both', () => {
		const { id, warning } = call('add_task', {
			title: 'both',
			attributes: { a: '1' },
			meta: { b: '2' }
		});
		expect(todo(id!).attributes).toEqual({ a: '1' });
		expect(warning).toBeUndefined();
	});
});

describe('a task block in a notebook', () => {
	test('add_block files a one-off, change_block moves it and takes it out', () => {
		const { id } = call('add_block', {
			date: '2026-10-01',
			title: 'fit the tap',
			start_time: '10:00',
			notebookId: kitchen,
			attributes: { part: 'mixer' }
		});
		const read = () =>
			slots.listExceptionals(ctx, '2026-10-01', '2026-10-02').find((one) => one.id === id)!;
		expect(read().notebookId).toBe(kitchen);
		expect(JSON.parse(read().attributes)).toEqual({ part: 'mixer' });

		call('change_block', { id: `exceptional:${id}`, notebookId: 0 });
		expect(read().notebookId).toBeNull();
		expect(JSON.parse(read().attributes)).toEqual({ part: 'mixer' });
	});

	test('change_repeating_block files a repeating one', () => {
		const { id } = call('add_repeating_block', { weekday: 4, start_time: '18:00', title: 'shop' });
		call('change_repeating_block', { id, notebookId: kitchen });
		expect(slots.listWeeklySlots(ctx).find((one) => one.id === id)!.notebookId).toBe(kitchen);
	});
});
