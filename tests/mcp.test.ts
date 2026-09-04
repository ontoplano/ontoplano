import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * The protocol an assistant speaks to this app, and the fence around it.
 *
 * Two kinds of thing are checked here and they are not the same kind. The
 * protocol half is a contract with somebody else's client: a malformed message
 * must come back as a JSON-RPC error rather than a crash, a notification must
 * get no answer at all, and `tools/list` must describe tools a model has never
 * seen well enough to pick between them.
 *
 * The scope half is the fence. A token holds the scopes it was granted, a tool
 * names the one it needs, and the two are compared on every call — not once at
 * `tools/list`. A client that calls a tool it was never offered is exactly the
 * case worth testing, because it is the one an attacker tries.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: unknown };

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/server/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/server/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));

	// A block belongs to a category, and a fresh account has none — the same
	// state `add_block` refuses with a sentence rather than a crash.
	const { createCategory } = await import('../src/lib/server/services/activities');
	createCategory(buildCtx(OWNER, { tz: 'UTC' }), { name: 'work', color: '#1d4ed8' });
});

const USER = OWNER;

function caller(scopes: string[]) {
	return { ctx: buildCtx(USER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }), scopes };
}

function call(scopes: string[], message: Rpc) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return handleBody(caller(scopes) as any, message) as any;
}

describe('the handshake', () => {
	it('answers initialize with what it is and what it can do', () => {
		const answer = call([], { jsonrpc: '2.0', id: 1, method: 'initialize' });
		expect(answer.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(answer.result.serverInfo.name).toBe('ontoplano');
		// Tools and nothing else: advertising a capability that is not there is
		// how a client ends up calling something that does not answer.
		expect(Object.keys(answer.result.capabilities)).toEqual(['tools']);
		expect(answer.result.instructions).toContain('Ontoplano');
	});

	it('says nothing at all to a notification', () => {
		expect(call([], { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
	});

	it('answers a ping', () => {
		expect(call([], { jsonrpc: '2.0', id: 2, method: 'ping' }).result).toEqual({});
	});

	it('refuses something that is not JSON-RPC 2.0', () => {
		const answer = call([], { jsonrpc: '1.0', id: 3, method: 'ping' } as unknown as Rpc);
		expect(answer.error.code).toBe(-32600);
	});

	it('refuses a method it does not have', () => {
		const answer = call([], { jsonrpc: '2.0', id: 4, method: 'resources/list' });
		expect(answer.error.code).toBe(-32601);
	});

	it('answers a batch with one response per request, and drops the notifications', () => {
		const answer = call(['today:read'], [
			{ jsonrpc: '2.0', id: 1, method: 'ping' },
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		] as any);
		expect(Array.isArray(answer)).toBe(true);
		expect(answer).toHaveLength(2);
		expect(answer.map((a: { id: number }) => a.id)).toEqual([1, 2]);
	});
});

describe('what a token is offered', () => {
	it('lists only the tools its scopes reach', () => {
		const answer = call(['today:read'], { jsonrpc: '2.0', id: 1, method: 'tools/list' });
		expect(answer.result.tools.map((t: { name: string }) => t.name)).toEqual(['today']);
	});

	it('offers a token with no scopes nothing', () => {
		const answer = call([], { jsonrpc: '2.0', id: 1, method: 'tools/list' });
		expect(answer.result.tools).toEqual([]);
	});

	/**
	 * The fence is on the call, not on the listing.
	 *
	 * A client that was never offered a tool can still name it — that is one
	 * line of JSON — so the scope has to be checked where the work happens.
	 */
	it('refuses a tool the token was not offered, and says which scope was missing', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'write_entry', arguments: { content: 'no' } }
		});
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toContain('notes:write');
	});

	it('refuses a tool that does not exist', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'drop_everything', arguments: {} }
		});
		expect(answer.error.code).toBe(-32602);
	});
});

describe('a tool that runs', () => {
	it('answers with the structured thing and the same thing as text', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		expect(answer.result.isError).toBe(false);
		expect(answer.result.structuredContent.date).toBe('2026-03-14');
		expect(JSON.parse(answer.result.content[0].text).date).toBe('2026-03-14');
	});

	/**
	 * A list is still an object at the top.
	 *
	 * `structuredContent` is a record in the protocol and clients validate it as
	 * one, so a tool that answered with a bare array failed at the client with
	 * "expected record, received array" — while every write went through. It
	 * read as one broken tool and was in fact every read that returns a list:
	 * the shopping list, the todos, the notebooks, the ideas.
	 */
	it('wraps a list rather than handing back a bare array', () => {
		const answer = call(['shopping:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'shopping_list', arguments: {} }
		});

		expect(answer.result.isError).toBe(false);
		expect(Array.isArray(answer.result.structuredContent)).toBe(false);
		expect(Array.isArray(answer.result.structuredContent.items)).toBe(true);
		// The count answers the question that follows a list, and shows a model
		// when it has been handed a truncated one.
		expect(answer.result.structuredContent.count).toBe(
			answer.result.structuredContent.items.length
		);
		// The text half says the same thing, in the same shape.
		expect(JSON.parse(answer.result.content[0].text).count).toBe(
			answer.result.structuredContent.count
		);
	});

	/**
	 * And the same asked of every read there is.
	 *
	 * A guard rather than four more examples: the next tool to answer with a
	 * list is written by somebody who has never read the paragraph above, and
	 * this is what tells them.
	 */
	it('answers every read with a record, whatever the service returned', () => {
		const wrong: string[] = [];

		for (const tool of TOOLS.filter((t) => !t.writes)) {
			const answer = call([tool.scope], {
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: tool.name, arguments: {} }
			});

			const structured = answer.result?.structuredContent;
			// A tool that refused the empty arguments has said so properly; what
			// it refused with is another test's business.
			if (answer.result?.isError) continue;
			if (structured === null || typeof structured !== 'object' || Array.isArray(structured)) {
				wrong.push(`${tool.name}: ${Array.isArray(structured) ? 'array' : typeof structured}`);
			}
		}

		expect(wrong).toEqual([]);
	});

	/**
	 * Every state a tool can put something into, it can take it back out of.
	 *
	 * This is the rule the surface kept breaking. An assistant could tick a
	 * shopping item bought and not untick it, finish a todo and not reopen it,
	 * close a goal and not reopen it, add an idea and not remove it — and a
	 * one-way verb does not produce a refusal, it produces a workaround: delete
	 * the row and make a new one, losing its category, its notes and its price
	 * history. The same shape as the assistant that "moved" a block by adding a
	 * duplicate and marking the original skipped.
	 *
	 * A pairing rather than an assertion about names: what matters is that
	 * something answers, not what it is called.
	 */
	it('offers a way back from everything it can do', () => {
		const names = new Set(TOOLS.map((t) => t.name));
		const oneWay: string[] = [];

		const pairs: [string, string[]][] = [
			['tick_bought', ['untick_bought']],
			['snooze_item', ['unsnooze_item']],
			['add_to_shopping_list', ['remove_from_shopping_list']],
			['finish_todo', ['reopen_todo']],
			['drop_todo', ['reopen_todo']],
			['schedule_todo', ['unschedule_todo']],
			['add_todo', ['drop_todo']],
			['close_goal', ['reopen_goal']],
			['add_idea', ['remove_idea']],
			['add_block', ['cancel_block']],
			['keep_habit', ['keep_habit']]
		];

		for (const [verb, backs] of pairs) {
			if (!names.has(verb)) continue;
			if (!backs.some((back) => names.has(back))) oneWay.push(verb);
		}

		expect(oneWay, 'these can be done and not undone').toEqual([]);
	});

	/**
	 * And the answer for a block, which is a state rather than a pair of tools:
	 * `todo` is how a tick is taken back.
	 */
	it('lets a block\u2019s answer be taken back', () => {
		const finish = TOOLS.find((t) => t.name === 'finish_block');
		const status = (finish?.input as { properties?: Record<string, { enum?: string[] }> })
			?.properties?.status;

		expect(status?.enum).toContain('todo');
	});

	/**
	 * Correcting a week that has already happened.
	 *
	 * Answering for a block always worked on any block; the only lists were
	 * today and the days ahead, so a block from last Tuesday had no id anybody
	 * could name. "I did not actually do Monday's run" was unanswerable for
	 * want of a listing.
	 */
	it('can see the days behind, and answer for them', () => {
		const seen = call(['schedule:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'past', arguments: { days: 7 } }
		});

		expect(seen.result.isError, seen.result.content?.[0]?.text).toBe(false);
		const { from, to } = seen.result.structuredContent;
		// The window ends today and starts a week before it.
		expect(from < to).toBe(true);
		expect(from.slice(0, 10) < '2026-03-14').toBe(true);
	});

	it('and refuses a day it cannot mean', () => {
		const answer = call(['schedule:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'past', arguments: { startingOn: 'last tuesday' } }
		});

		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toContain('2026-09-01');
	});

	/**
	 * "Read this goal and make tasks out of it" — the whole sentence.
	 *
	 * Reading the goal worked and making the todos worked; what was missing was
	 * the third act, so the tasks existed and counted towards nothing. And the
	 * only linking the app had replaces the whole set, which for a caller that
	 * knows about three todos means unlinking everything it does not know about.
	 */
	it('breaks a goal into tasks that count towards it', () => {
		const goal = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'add_todo',
				arguments: { title: 'A task with no goal' }
			}
		});
		expect(goal.result.isError).toBe(false);
		const orphan = goal.result.structuredContent.id as number;

		// A goal to hang work on, made by the service the page uses.
		const madeGoal = call(['tasks:read'], {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'goals', arguments: {} }
		});
		expect(madeGoal.result.isError).toBe(false);

		const goalId = database.get(
			'select id from goals where user_id = ? order by id desc limit 1',
			USER
		) as { id: number } | undefined;
		if (!goalId) {
			// No goal in the fixture: make one the same way the page does.
			database.exec(
				`insert into goals (user_id, title, notes, horizon, period_start, unit, status, created_at, updated_at)
				 values (?, 'Learn to swim', 'Lessons, then a lake.', 'quarter', '2026-01-01', '', 'open',
				         '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
				USER
			);
		}
		const target = (
			database.get('select id from goals where user_id = ? order by id desc limit 1', USER) as {
				id: number;
			}
		).id;

		// One call makes the task and attaches it.
		const linked = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: {
				name: 'add_todo',
				arguments: { title: 'Book the first lesson', goalId: target }
			}
		});
		expect(linked.result.isError, linked.result.content?.[0]?.text).toBe(false);
		const linkedId = linked.result.structuredContent.id as number;

		const links = () =>
			database.get('select count(*) as n from goal_links where goal_id = ?', target) as {
				n: number;
			};
		expect(links().n).toBe(1);

		// And existing work goes on without disturbing what is there.
		const also = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'link_to_goal', arguments: { goalId: target, todoIds: [orphan] } }
		});
		expect(also.result.isError).toBe(false);
		expect(links().n, 'linking one unlinked the other').toBe(2);

		// Twice is not two links.
		call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 5,
			method: 'tools/call',
			params: { name: 'link_to_goal', arguments: { goalId: target, todoIds: [orphan] } }
		});
		expect(links().n).toBe(2);

		// And off again, one at a time.
		call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 6,
			method: 'tools/call',
			params: { name: 'unlink_from_goal', arguments: { goalId: target, todoIds: [orphan] } }
		});
		expect(links().n).toBe(1);
		expect(linkedId).toBeGreaterThan(0);
	});

	it('writes, and the write is the service’s own', () => {
		const made = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: 'Buy garlic' } }
		});
		expect(made.result.isError).toBe(false);
		const id = made.result.structuredContent.id;
		expect(id).toBeGreaterThan(0);

		const listed = call(['tasks:read'], {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'todos', arguments: {} }
		});
		expect(
			listed.result.structuredContent.items.some((t: { title: string }) => t.title === 'Buy garlic')
		).toBe(true);
	});

	/**
	 * A service's refusal reaches the model as words rather than as a crash.
	 *
	 * `isError` on the result, not a protocol error: the difference is whether
	 * the model can do anything about it, and "that is not a date" is something
	 * it can act on immediately.
	 */
	it('hands a refusal back as something the model can read', () => {
		const answer = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: 'x', scheduledDate: 'thursday' } }
		});
		expect(answer.error).toBeUndefined();
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toMatch(/date/i);
	});

	/**
	 * The two things an assistant could not do, reported from a real session.
	 *
	 * Asked to skip two blocks and put three real ones on today, it could do
	 * neither: there was no tool that answers for a block, and none that puts an
	 * hour on a day. What it did instead was write todos with the times inside
	 * their titles — "deep work 09:00–11:00" — and leave the blocks it was asked
	 * to skip sitting there unanswered. Both halves are `schedule:write` now.
	 */
	it('puts a block on a day, with an hour on it', () => {
		const made = call(['schedule:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'add_block',
				arguments: {
					date: '2026-03-14',
					title: 'Deep work',
					start_time: '09:00',
					minutes: 120
				}
			}
		});
		expect(made.result.isError, JSON.stringify(made.result.content)).toBe(false);
		expect(made.result.structuredContent.id).toBeGreaterThan(0);

		// And it is on the day, as a block rather than as a task with a time in
		// its name — which is the whole difference.
		const board = call(['today:read'], {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		const block = board.result.structuredContent.blocks.find(
			(b: { title: string }) => b.title === 'Deep work'
		);
		expect(block, 'the block is not on today').toBeTruthy();
		expect(block.start_time).toBe('09:00');
		expect(block.duration_minutes).toBe(120);
	});

	it('answers for a block, including when the answer is no', () => {
		call(['schedule:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'add_block',
				arguments: { date: '2026-03-14', title: 'Treino', start_time: '18:00' }
			}
		});

		const board = call(['today:read'], {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		const treino = board.result.structuredContent.blocks.find(
			(b: { title: string }) => b.title === 'Treino'
		);
		expect(treino).toBeTruthy();

		const skipped = call(['schedule:write'], {
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'finish_block', arguments: { id: treino.id, status: 'skipped' } }
		});
		expect(skipped.result.isError, JSON.stringify(skipped.result.content)).toBe(false);

		const after = call(['today:read'], {
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		const again = after.result.structuredContent.blocks.find(
			(b: { title: string }) => b.title === 'Treino'
		);
		expect(again.status).toBe('skipped');
	});

	/** Reading the week is not permission to change it. */
	it('refuses to change the week on a read-only token', () => {
		const answer = call(['schedule:read', 'today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: {
				name: 'add_block',
				arguments: { date: '2026-03-14', title: 'nope', start_time: '10:00' }
			}
		});
		expect(answer.result.isError || answer.error).toBeTruthy();
	});

	it('refuses an empty title the way the form does', () => {
		const answer = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: '' } }
		});
		expect(answer.result.isError).toBe(true);
	});
});

/**
 * Every tool is described well enough to be chosen correctly.
 *
 * A model picks a tool from its name and its sentence and nothing else. A tool
 * whose description restates its name — "add_todo: adds a todo" — is a tool
 * that gets called for the wrong reasons, and the cost lands in somebody's
 * actual diary.
 */
describe('the descriptions', () => {
	it('say more than the name does', () => {
		for (const tool of TOOLS) {
			expect(tool.description.length, `${tool.name} barely says anything`).toBeGreaterThan(60);
			expect(tool.title.length, `${tool.name} has no title`).toBeGreaterThan(0);
		}
	});

	it('declare a scope that exists', async () => {
		const { ALL_SCOPES } = await import('../src/lib/server/services/tokens');
		for (const tool of TOOLS)
			expect(ALL_SCOPES, `${tool.name} wants a scope nobody can grant`).toContain(tool.scope);
	});

	it('ask a writing tool for a writing scope', () => {
		for (const tool of TOOLS)
			if (tool.writes)
				expect(tool.scope, `${tool.name} writes with a read scope`).toMatch(/:write$/);
	});

	it('take an object, and refuse arguments they do not know', () => {
		for (const tool of TOOLS) {
			expect(tool.input.type).toBe('object');
			expect(tool.input.additionalProperties).toBe(false);
		}
	});
});

/**
 * The afternoon that went wrong, driven through the protocol.
 *
 * Asked to "push the study block to four" and "put there that I was actually
 * working on Ontoplano", an assistant with only `add_block` and `finish_block`
 * did the only thing those two allow: it added a second block at 16:00 and
 * marked the original **skipped** to clear the first one off the grid. The day
 * then held two study blocks and a skip that never happened — and a skip is what
 * the weekly review asks about, so the workaround wrote a small lie into
 * somebody's record of their own week.
 *
 * A tool surface that cannot express an ordinary request does not produce a
 * refusal. It produces a workaround.
 */
describe('the afternoon that went wrong', () => {
	const PLANNER = ['today:read', 'schedule:read', 'schedule:write'];

	function tool(name: string, args: Record<string, unknown>) {
		return call(PLANNER, {
			jsonrpc: '2.0',
			id: 90,
			method: 'tools/call',
			params: { name, arguments: args }
		});
	}

	function today() {
		const answer = call(PLANNER, {
			jsonrpc: '2.0',
			id: 91,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		return JSON.parse(answer.result.content[0].text) as {
			blocks: { id: string; title: string; start_time: string; status: string }[];
		};
	}

	it('moves a block instead of duplicating it', () => {
		const added = tool('add_block', {
			date: '2026-03-14',
			title: 'Study block',
			start_time: '14:00',
			minutes: 90
		});
		expect(added.error, JSON.stringify(added.error)).toBeUndefined();

		const before = today().blocks.filter((b) => b.title === 'Study block');
		expect(before).toHaveLength(1);

		const moved = tool('change_block', { id: before[0].id, start_time: '16:00' });
		expect(moved.error, JSON.stringify(moved.error)).toBeUndefined();

		const after = today().blocks.filter((b) => b.title === 'Study block');
		// One block, at the new time. Not two, and not one plus a skip.
		expect(after).toHaveLength(1);
		expect(after[0].start_time).toBe('16:00');
		expect(after[0].status).not.toBe('skipped');
	});

	it('renames a block to what the work actually was', () => {
		const added = tool('add_block', {
			date: '2026-03-14',
			title: 'Study block',
			start_time: '11:00',
			minutes: 90
		});
		const id = JSON.parse(added.result.content[0].text).id;

		const renamed = tool('change_block', { id: `exceptional:${id}`, title: 'Ontoplano' });
		expect(renamed.error, JSON.stringify(renamed.error)).toBeUndefined();

		const titles = today().blocks.map((b) => b.title);
		expect(titles).toContain('Ontoplano');
	});

	it('takes a block off the day without calling it skipped', () => {
		const added = tool('add_block', {
			date: '2026-03-14',
			title: 'Cancelled thing',
			start_time: '20:00',
			minutes: 30
		});
		const id = JSON.parse(added.result.content[0].text).id;

		// Counted before and after: other tests in this file skip things on
		// purpose, and what matters is that cancelling adds none of its own.
		const skipsBefore = today().blocks.filter((b) => b.status === 'skipped').length;

		const gone = tool('cancel_block', { id: `exceptional:${id}` });
		expect(gone.error, JSON.stringify(gone.error)).toBeUndefined();

		const blocks = today().blocks;
		expect(blocks.find((b) => b.title === 'Cancelled thing')).toBeUndefined();
		expect(blocks.filter((b) => b.status === 'skipped')).toHaveLength(skipsBefore);
	});

	it('needs schedule:write to change or cancel anything', () => {
		for (const name of ['change_block', 'cancel_block']) {
			const answer = call(['today:read', 'schedule:read'], {
				jsonrpc: '2.0',
				id: 92,
				method: 'tools/call',
				params: { name, arguments: { id: 'exceptional:1', start_time: '10:00' } }
			});
			// Named, not merely refused: a client that is told which scope it
			// lacked can ask for it.
			expect(answer.result.isError || answer.error, name).toBeTruthy();
			expect(JSON.stringify(answer)).toContain('schedule:write');
		}
	});
});

/**
 * Whether the tools cover the verbs a person actually uses.
 *
 * Not a style rule: the gap that produced a fake skip was exactly this — a
 * surface with `add` and `finish` and no way to change or remove. Every kind of
 * thing an assistant may write to needs the ordinary verbs, or the next missing
 * one gets improvised too.
 */
describe('the shape of the surface', () => {
	const names = () => new Set(TOOLS.map((t) => t.name));

	it('can change and remove a block on a day, not only add one', () => {
		for (const verb of ['add_block', 'change_block', 'cancel_block', 'finish_block']) {
			expect(names().has(verb), verb).toBe(true);
		}
	});

	it('can take a todo back off a day, and bin one', () => {
		for (const verb of [
			'add_todo',
			'finish_todo',
			'schedule_todo',
			'unschedule_todo',
			'drop_todo'
		]) {
			expect(names().has(verb), verb).toBe(true);
		}
	});

	it('can say a habit was kept, not only read whether it was', () => {
		expect(names().has('keep_habit')).toBe(true);
	});

	it('can say how a goal ended', () => {
		expect(names().has('close_goal')).toBe(true);
	});

	it('can take something off the shopping list as well as tick it bought', () => {
		expect(names().has('remove_from_shopping_list')).toBe(true);
	});

	/**
	 * The description is the whole interface for a model that has never seen this
	 * app, and the confusion that caused this was between two words. Both tools
	 * have to say which is which.
	 */
	it('tells skipped and cancelled apart, in both directions', () => {
		const skip = TOOLS.find((t) => t.name === 'finish_block')!.description;
		const cancel = TOOLS.find((t) => t.name === 'cancel_block')!.description;

		expect(skip).toContain('cancel_block');
		expect(skip).toContain('change_block');
		expect(cancel.toLowerCase()).toContain('not the same');
	});

	it('every writing tool names a write scope', () => {
		for (const t of TOOLS.filter((t) => t.writes)) {
			expect(t.scope, t.name).toMatch(/:write|:manage/);
		}
	});
});
