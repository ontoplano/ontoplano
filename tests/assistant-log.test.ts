/**
 * The log of what an assistant did, and the way back.
 *
 * Every MCP write answers with the state it replaced, but that answer goes to
 * whoever holds the transcript — the owner of the data holds none. So every
 * write also lands in `assistant_calls`, and a call that deleted something can
 * be put back from the `before` it recorded, through the same create the app
 * uses.
 *
 * The round trips here are the whole point: one per deleting tool, because a
 * "way back" that covers seven of nine tools is a promise with a hole in it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/server/services/ctx').buildCtx;
let log: typeof import('../src/lib/server/services/assistant-log');
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/server/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	log = await import('../src/lib/server/services/assistant-log');

	const { createCategory } = await import('../src/lib/server/services/activities');
	createCategory(ctx(), { name: 'work', color: '#1d4ed8' });
});

const NOW = new Date('2026-03-14T10:00:00Z');
const EVERYTHING = ['destructive'];

function ctx(user = OWNER) {
	return buildCtx(user, { tz: 'UTC', now: NOW });
}

function rpc(name: string, args: Record<string, unknown>, user = OWNER) {
	const scopes = [...new Set(TOOLS.map((t) => t.scope)), ...EVERYTHING];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const answer = handleBody({ ctx: ctx(user), scopes } as any, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any;
	expect(answer.result.isError, `${name}: ${answer.result.content?.[0]?.text}`).toBe(false);
	return answer.result.structuredContent;
}

function newestCall(user = OWNER) {
	return log.listAssistantCalls(ctx(user), { limit: 1 })[0];
}

describe('what gets written down', () => {
	it('a write lands in the log with its before; a read leaves no trace', () => {
		const countBefore = log.listAssistantCalls(ctx(), { limit: 200 }).length;
		rpc('todos', {});
		expect(log.listAssistantCalls(ctx(), { limit: 200 })).toHaveLength(countBefore);

		const made = rpc('add_todo', { title: 'read the meter' });
		const row = newestCall();
		expect(row.tool).toBe('add_todo');
		expect(row.before).toBe(null);
		expect(row.destroyed).toBe(false);

		rpc('change_todo', { id: made.id, title: 'read both meters' });
		const changed = newestCall();
		expect(changed.tool).toBe('change_todo');
		expect((changed.before as { title: string }).title).toBe('read the meter');
	});

	it("one account's log is invisible to another", () => {
		expect(log.listAssistantCalls(ctx(STRANGER))).toEqual([]);
	});

	it('keeps the newest and prunes the rest', async () => {
		const { recordAssistantCall, listAssistantCalls, CALLS_KEPT } = log;
		for (let i = 0; i < CALLS_KEPT + 20; i++) {
			recordAssistantCall(ctx(STRANGER), {
				tool: 'add_todo',
				args: { i },
				before: null,
				destroyed: false
			});
		}
		expect(listAssistantCalls(ctx(STRANGER), { limit: 200 })).toHaveLength(200);
		const total = database.get(
			'select count(*) as n from assistant_calls where user_id = ?',
			STRANGER
		) as { n: number };
		expect(total.n).toBe(CALLS_KEPT);
	});
});

describe('put it back', () => {
	/** Delete via the tool, put back via the log, read back via the tool. */
	function roundTrip(opts: {
		make: () => number;
		remove: string;
		list: string;
		found: (items: Record<string, unknown>[]) => boolean;
	}) {
		const id = opts.make();
		rpc(opts.remove, { id });
		expect(opts.found(rpc(opts.list, {}).items), 'the delete did not delete').toBe(false);

		const row = newestCall();
		expect(row.destroyed).toBe(true);

		const { made } = log.putBack(ctx(), row.id);
		expect(made.length).toBeGreaterThan(0);
		expect(opts.found(rpc(opts.list, {}).items), 'the put back did not put back').toBe(true);

		// Offered once: the row is marked restored and refuses a second press.
		expect(() => log.putBack(ctx(), row.id)).toThrow(/already/i);
	}

	it('a dropped todo', () => {
		roundTrip({
			make: () => rpc('add_todo', { title: 'fix the gate', notes: 'left hinge' }).id,
			remove: 'drop_todo',
			list: 'todos',
			found: (items) => items.some((t) => t.title === 'fix the gate')
		});
	});

	it('a removed notebook', () => {
		roundTrip({
			make: () => rpc('add_notebook', { title: 'The gate project' }).id,
			remove: 'remove_notebook',
			list: 'notebooks',
			found: (items) => items.some((n) => n.title === 'The gate project')
		});
	});

	it('a removed idea, favourite and all', () => {
		const id = rpc('add_idea', { content: 'a gate that oils itself', tags: 'house' }).id;
		rpc('favorite_idea', { id });
		rpc('remove_idea', { id });

		const row = newestCall();
		log.putBack(ctx(), row.id);

		const back = rpc('ideas', {}).items.find(
			(i: { content: string }) => i.content === 'a gate that oils itself'
		);
		expect(back).toBeDefined();
		expect(back.favorite).toBe(true);
		expect(back.tags.map((t: { name: string }) => t.name)).toContain('house');
	});

	it('a removed shopping item', () => {
		roundTrip({
			make: () => {
				rpc('add_to_shopping_list', { name: 'Hinge oil' });
				return rpc('shopping_list', {}).items.find((i: { name: string }) => i.name === 'Hinge oil')
					.id;
			},
			remove: 'remove_from_shopping_list',
			list: 'shopping_list',
			found: (items) => items.some((i) => i.name === 'Hinge oil')
		});
	});

	it('a removed shopping section', () => {
		roundTrip({
			make: () => rpc('add_shopping_category', { name: 'Hardware' }).id,
			remove: 'remove_shopping_category',
			list: 'shopping_categories',
			found: (items) => items.some((c) => c.name === 'Hardware')
		});
	});

	it('a cancelled alarm', () => {
		roundTrip({
			make: () => rpc('set_alarm', { at: '2026-03-14T18:00', message: 'oil the gate' }).id,
			remove: 'cancel_alarm',
			list: 'reminders',
			found: (items) => items.some((r) => r.message === 'oil the gate')
		});
	});

	it('a removed repeating block, rhythm and all', () => {
		const id = rpc('add_repeating_block', {
			weekday: 2,
			title: 'gate maintenance',
			start_time: '09:00',
			category: 'work',
			repeats: 'every_n_weeks',
			every: 2
		}).id;
		rpc('remove_repeating_block', { id });

		const row = newestCall();
		log.putBack(ctx(), row.id);

		const back = rpc('repeating_week', {}).items.find(
			(w: { label: string }) => w.label === 'gate maintenance'
		);
		expect(back).toBeDefined();
		expect(back.recurrence).toMatch(/^weeks:2:/);
	});

	it('a removed location', () => {
		// The locations tool answers with a tree, not a flat list.
		const inTree = () => JSON.stringify(rpc('locations', {}).locations).includes('"The shed"');

		const id = rpc('add_location', { name: 'The shed' }).id;
		rpc('remove_location', { id });
		expect(inTree(), 'the delete did not delete').toBe(false);

		const row = newestCall();
		log.putBack(ctx(), row.id);
		expect(inTree(), 'the put back did not put back').toBe(true);
	});

	it('a removed workout category', () => {
		const listed = () =>
			rpc('workout_categories', {}).categories.some((c: { name: string }) => c.name === 'Grip');

		const id = rpc('add_workout_category', { name: 'Grip' }).id;
		rpc('remove_workout_category', { id });
		expect(listed(), 'the delete did not delete').toBe(false);

		const row = newestCall();
		log.putBack(ctx(), row.id);
		expect(listed(), 'the put back did not put back').toBe(true);
	});

	it('refuses a call that deleted nothing', () => {
		rpc('add_todo', { title: 'just an add' });
		expect(() => log.putBack(ctx(), newestCall().id)).toThrow(/deleted nothing/i);
	});

	it("refuses another account's row", () => {
		const made = rpc('add_todo', { title: 'mine to lose' });
		rpc('drop_todo', { id: made.id });
		const row = newestCall();

		expect(() => log.putBack(ctx(STRANGER), row.id)).toThrow();
	});

	it('a reminder that belonged to something is not recreated loose', () => {
		log.recordAssistantCall(ctx(), {
			tool: 'cancel_alarm',
			args: { id: 1 },
			before: { subjectKind: 'instance', subjectId: 1, remindAt: '2026-03-14T09:00:00' },
			destroyed: true
		});
		expect(() => log.putBack(ctx(), newestCall().id)).toThrow(/belonged to something/i);
	});
});
