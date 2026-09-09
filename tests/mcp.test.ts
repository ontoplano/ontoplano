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
			['archive_item', ['unarchive_item']],
			['add_to_shopping_list', ['remove_from_shopping_list']],
			['finish_todo', ['reopen_todo']],
			['drop_todo', ['reopen_todo']],
			['schedule_todo', ['unschedule_todo']],
			['add_todo', ['drop_todo']],
			['close_goal', ['reopen_goal']],
			['add_idea', ['remove_idea']],
			['add_block', ['cancel_block']],
			['tick_habit', ['tick_habit']],
			['add_repeating_block', ['remove_repeating_block']],
			['remind_before_block', ['dismiss_reminder']],
			['apply_idea', ['apply_idea']],
			['favorite_idea', ['favorite_idea']],
			['archive_recipe', ['archive_recipe']]
			// add_goal, add_goal_area, add_habit and add_person have no delete
			// on purpose — see the block comment in tools.ts: precious data is
			// deleted by the person, in the app.
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

	it('can tick a habit, not only read whether it was ticked', () => {
		expect(names().has('tick_habit')).toBe(true);
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

/**
 * The edit verbs, and the fence around ideas.
 *
 * The write surface could add todos, ideas, recipes and a goal's links but
 * change none of them — a typo was a delete-and-retype, and `kitchen:write`'s
 * own sentence had promised "add and change recipes" all along. What all four
 * change tools share: only the fields given change.
 *
 * Ideas also moved out of `notes:*` into scopes of their own, because a token
 * that could add to the idea inbox could read the diary — so the old grant
 * reaching them is exactly what must now fail.
 */
describe('editing what was created', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('changes a todo, and only the fields given', () => {
		const made = rpc(1, 'add_todo', { title: 'buy stamps', notes: 'the square ones' }, [
			'tasks:write'
		]);
		const id = made.result.structuredContent.id as number;

		const changed = rpc(2, 'change_todo', { id, title: 'buy ten stamps' }, ['tasks:write']);
		expect(changed.result.isError).toBe(false);

		const list = rpc(3, 'todos', {}, ['tasks:read']);
		const row = list.result.structuredContent.items.find((t: { id: number }) => t.id === id);
		expect(row.title).toBe('buy ten stamps');
		expect(row.notes).toBe('the square ones');
	});

	it('changes a goal the person already committed to', () => {
		database.exec(
			`insert into goals (user_id, title, notes, horizon, period_start, unit, status, created_at, updated_at)
			 values (?, 'Swim across', 'The far pier.', 'quarter', '2026-01-01', '', 'open',
			         '2026-01-01T00:00:00', '2026-01-01T00:00:00')`,
			USER
		);
		const target = (
			database.get('select id from goals where user_id = ? order by id desc limit 1', USER) as {
				id: number;
			}
		).id;

		const changed = rpc(
			4,
			'change_goal',
			{ id: target, title: 'Swim across the bay', targetValue: 12, unit: 'sessions' },
			['tasks:write']
		);
		expect(changed.result.isError).toBe(false);

		const goals = rpc(5, 'goals', {}, ['tasks:read']);
		const row = goals.result.structuredContent.items.find((g: { id: number }) => g.id === target);
		expect(row.title).toBe('Swim across the bay');
		expect(row.unit).toBe('sessions');
		// What was not said stayed.
		expect(row.notes).toBe('The far pier.');
	});

	it('rewrites an idea and keeps its tags', () => {
		const made = rpc(6, 'add_idea', { content: 'a sauna in the garden', tags: 'house, someday' }, [
			'ideas:write'
		]);
		const id = made.result.structuredContent.id as number;

		rpc(7, 'change_idea', { id, content: 'a sauna by the lake' }, ['ideas:write']);

		const list = rpc(8, 'ideas', {}, ['ideas:read']);
		const row = list.result.structuredContent.items.find((i: { id: number }) => i.id === id);
		expect(row.content).toBe('a sauna by the lake');
		expect(row.tags.map((t: { name: string }) => t.name).sort()).toEqual(['house', 'someday']);
	});

	it('changes a recipe and adds ingredients without losing the old ones', () => {
		const made = rpc(
			9,
			'add_recipe',
			{ title: 'Pão de queijo', ingredients: '500 g polvilho\n2 eggs', method: 'Mix. Bake.' },
			['kitchen:write']
		);
		const id = made.result.structuredContent.id as number;

		const changed = rpc(10, 'change_recipe', { id, minutes: 40, ingredients: '100 g parmesan' }, [
			'kitchen:write'
		]);
		expect(changed.result.isError).toBe(false);

		const read = rpc(11, 'recipes', { id }, ['kitchen:read']);
		expect(read.result.structuredContent.title).toBe('Pão de queijo');
		expect(read.result.structuredContent.minutes).toBe(40);
		expect(read.result.structuredContent.method).toBe('Mix. Bake.');
		expect(read.result.structuredContent.ingredients.length).toBe(3);
	});

	it('keeps ideas behind their own gate, apart from notes', () => {
		const read = rpc(12, 'ideas', {}, ['notes:read', 'notes:write']);
		expect(read.result.isError).toBe(true);
		expect(read.result.content[0].text).toContain('ideas:read');

		const write = rpc(13, 'add_idea', { content: 'no' }, ['notes:write']);
		expect(write.result.isError).toBe(true);
		expect(write.result.content[0].text).toContain('ideas:write');
	});
});

/**
 * The rooms that had no door, opened.
 *
 * A week of real use found what the surface could not say: the repeating
 * week was read-only, reminders and people were unreachable, a goal's own
 * number could not move, and a mistyped category was silently filed under
 * the first one and reported as success. What is pinned here is the shape of
 * each new door — and that the category miss is now a refusal that names the
 * real choices.
 */
describe('the opened rooms', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('refuses a category that names nothing, listing the real ones', () => {
		const answer = rpc(
			1,
			'add_block',
			{
				date: '2026-03-14',
				title: 'deep work',
				start_time: '09:00',
				category: 'wrok'
			},
			['schedule:write']
		);
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toContain('No category called "wrok"');
		expect(answer.result.content[0].text).toContain('work');
	});

	it('adds to the repeating week, changes it, and takes it out again', () => {
		const made = rpc(
			2,
			'add_repeating_block',
			{
				weekday: 2,
				title: 'gym',
				start_time: '07:00',
				minutes: 60,
				category: 'work',
				urgency: 4
			},
			['schedule:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const week = rpc(3, 'repeating_week', {}, ['schedule:read']);
		const row = week.result.structuredContent.items.find((w: { id: number }) => w.id === id);
		expect(row.weekday).toBe(2);
		expect(row.urgency).toBe(4);

		const moved = rpc(4, 'change_repeating_block', { id, weekday: 3, minutes: 90 }, [
			'schedule:write'
		]);
		expect(moved.result.isError, moved.result.content?.[0]?.text).toBe(false);
		const after = rpc(5, 'repeating_week', {}, ['schedule:read']);
		const changed = after.result.structuredContent.items.find((w: { id: number }) => w.id === id);
		expect(changed.weekday).toBe(3);
		expect(changed.durationMinutes).toBe(90);
		expect(changed.label).toBe('gym');

		const gone = rpc(6, 'remove_repeating_block', { id }, ['schedule:write', 'destructive']);
		expect(gone.result.isError).toBe(false);
	});

	/**
	 * The app has offered every-N-weeks, every-N-days and monthly blocks since
	 * blocks could repeat at all. This surface could only make weekly ones, so
	 * "put the bins out every other Tuesday" was a thing a person could do and
	 * an assistant could not.
	 */
	it('makes a block that comes back on something other than a weekly rhythm', () => {
		const bins = rpc(
			2,
			'add_repeating_block',
			{
				weekday: 1,
				title: 'bins',
				start_time: '08:00',
				category: 'work',
				repeats: 'every_n_weeks',
				every: 2
			},
			['schedule:write']
		);
		expect(bins.result.isError, bins.result.content?.[0]?.text).toBe(false);
		const binsId = bins.result.structuredContent.id as number;

		const week = rpc(3, 'repeating_week', {}, ['schedule:read']);
		const row = week.result.structuredContent.items.find((w: { id: number }) => w.id === binsId);
		expect(row.recurrence).toMatch(/^weeks:2:\d{4}-\d{2}-\d{2}$/);
		// The anchor is a Tuesday, so the fortnight counts from the day meant.
		expect(new Date(`${row.recurrence.split(':')[2]}T00:00:00`).getDay()).toBe(2);
		// And the row says so in words rather than in the stored shorthand.
		expect(row.repeats).toBe('Every other Tuesday');

		const monthly = rpc(
			4,
			'add_repeating_block',
			{
				weekday: 0,
				title: 'rent',
				start_time: '09:00',
				category: 'work',
				repeats: 'monthly',
				month_day: 1
			},
			['schedule:write']
		);
		expect(monthly.result.isError, monthly.result.content?.[0]?.text).toBe(false);
		const rentId = monthly.result.structuredContent.id as number;

		// Changing only the length leaves the rhythm alone...
		rpc(5, 'change_repeating_block', { id: rentId, minutes: 30 }, ['schedule:write']);
		let after = rpc(6, 'repeating_week', {}, ['schedule:read']);
		let rent = after.result.structuredContent.items.find((w: { id: number }) => w.id === rentId);
		// `monthly:1:<start>` — the day of the month, and the day the rhythm
		// starts, because a rule with no start is a rule about every 1st there
		// has ever been.
		expect(rent.recurrence).toMatch(/^monthly:1:\d{4}-\d{2}-\d{2}$/);
		expect(rent.repeats).toBe('Day 1 of each month');

		// ...and asking for a new one replaces it.
		rpc(7, 'change_repeating_block', { id: rentId, repeats: 'every_n_days', every: 3 }, [
			'schedule:write'
		]);
		after = rpc(8, 'repeating_week', {}, ['schedule:read']);
		rent = after.result.structuredContent.items.find((w: { id: number }) => w.id === rentId);
		expect(rent.recurrence).toMatch(/^days:3:/);
		expect(rent.repeats).toBe('Every 3 days');
	});

	it('refuses an interval that is not a number of times', () => {
		const bad = rpc(
			2,
			'add_repeating_block',
			{
				weekday: 1,
				title: 'nonsense',
				start_time: '08:00',
				category: 'work',
				repeats: 'every_n_days',
				every: 0
			},
			['schedule:write']
		);
		expect(bad.result.isError).toBe(true);
		expect(bad.result.content[0].text).toContain('every');
	});

	/**
	 * The weekday a model is told about has to be the weekday the app means.
	 *
	 * Both write tools documented "0 (Sunday)" while every weekday in this
	 * codebase counts from Monday, so an assistant asked for Tuesdays put the
	 * block on Wednesdays and the person had to notice for it.
	 */
	/**
	 * `habits:write` on its own used to be a permission that could not be used:
	 * the tick takes an id, and ids only come from `habits`, which is behind
	 * `habits:read`. Rather than have one grant imply the other — a tick is not
	 * a licence to read a month of somebody's slips — the write tool finds the
	 * habit itself.
	 */
	/**
	 * An assistant asked to fold stretching into the morning routine could read
	 * the activity, rewrite every block that used it, and not change the one
	 * sentence saying what the routine is: activities were read-only here.
	 */
	it('files a shopping item into a section, by name', () => {
		const section = rpc(60, 'add_shopping_category', { name: 'Dairy', holdsFood: true }, [
			'shopping:write'
		]);
		expect(section.result.isError, section.result.content?.[0]?.text).toBe(false);

		const milk = rpc(61, 'add_to_shopping_list', { name: 'milk', section: 'dairy' }, [
			'shopping:write'
		]);
		expect(milk.result.isError, milk.result.content?.[0]?.text).toBe(false);

		const list = rpc(62, 'shopping_list', {}, ['shopping:read']);
		const row = list.result.structuredContent.items.find(
			(i: { name: string }) => i.name === 'milk'
		);
		expect(row.shoppingCategoryId).toBe(section.result.structuredContent.id);

		// And out again: an empty section name unfiles.
		const out = rpc(63, 'file_shopping_item', { id: row.id, section: '' }, ['shopping:write']);
		expect(out.result.isError).toBe(false);

		// A section nobody has is refused with the ones that exist.
		const missing = rpc(64, 'file_shopping_item', { id: row.id, section: 'aisle nine' }, [
			'shopping:write'
		]);
		expect(missing.result.isError).toBe(true);
		expect(missing.result.content?.[0]?.text).toContain('Dairy');
	});

	it('removes an empty notebook, and refuses one holding writing', () => {
		const empty = rpc(65, 'add_notebook', { title: 'made by mistake' }, ['notes:write']);
		const emptyId = empty.result.structuredContent?.id as number;
		expect(empty.result.isError, empty.result.content?.[0]?.text).toBe(false);

		const gone = rpc(66, 'remove_notebook', { id: emptyId }, ['notes:write', 'destructive']);
		expect(gone.result.isError, gone.result.content?.[0]?.text).toBe(false);

		const kept = rpc(67, 'add_notebook', { title: 'the trip' }, ['notes:write']);
		const keptId = kept.result.structuredContent?.id as number;
		rpc(68, 'write_entry', { content: 'Vans booked.', notebookId: keptId }, ['notes:write']);
		const refused = rpc(69, 'remove_notebook', { id: keptId }, ['notes:write', 'destructive']);
		expect(refused.result.isError).toBe(true);
		expect(refused.result.content?.[0]?.text).toContain('deleted by the person');
	});

	it('adds an activity and changes what it says', () => {
		const made = rpc(
			55,
			'add_activity',
			{ name: 'morning routine', category: 'work', description: 'coffee, plants' },
			['schedule:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const changed = rpc(56, 'change_activity', { id, description: 'coffee, plants, stretching' }, [
			'schedule:write'
		]);
		expect(changed.result.isError, changed.result.content?.[0]?.text).toBe(false);

		const list = rpc(57, 'activities', {}, ['schedule:read']);
		const row = list.result.structuredContent.items.find((a: { id: number }) => a.id === id);
		expect(row.description).toBe('coffee, plants, stretching');
		// The name it was given is untouched by a change that did not mention it.
		expect(row.name).toBe('morning routine');
	});

	it('ticks a habit by name, with the write grant alone', () => {
		const made = rpc(50, 'add_habit', { name: 'stretching', kind: 'good' }, ['habits:write']);
		const habitId = made.result.structuredContent?.id as number | undefined;
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);

		const ticked = rpc(51, 'tick_habit', { name: 'stretching' }, ['habits:write']);
		expect(ticked.result.isError, ticked.result.content?.[0]?.text).toBe(false);

		// A name nobody has is refused with what the account does have, and a
		// name that matches two is refused rather than guessed: ticking the
		// wrong habit is a lie in somebody's history.
		const missing = rpc(52, 'tick_habit', { name: 'nothing like this' }, ['habits:write']);
		expect(missing.result.isError).toBe(true);
		expect(habitId).toBeTruthy();
	});

	it('numbers weekdays from Monday, as the tool descriptions now say', () => {
		const names = TOOLS.filter((t) => 'weekday' in (t.input.properties ?? {}));
		expect(names.length).toBeGreaterThan(0);
		for (const tool of names) {
			const said = JSON.stringify(tool.input.properties.weekday);
			expect(said, `${tool.name} still documents the old numbering`).toContain('Monday');
			expect(said).not.toContain('0 (Sunday)');
		}

		// And the behaviour the sentence describes: weekday 0 is a Monday.
		const made = rpc(
			40,
			'add_repeating_block',
			{ weekday: 0, title: 'monday probe', start_time: '06:00', category: 'work' },
			['schedule:write']
		);
		const id = made.result.structuredContent.id as number;
		const week = rpc(41, 'repeating_week', {}, ['schedule:read']);
		const row = week.result.structuredContent.items.find((w: { id: number }) => w.id === id);
		expect(row.weekday).toBe(0);
		rpc(42, 'remove_repeating_block', { id }, ['schedule:write', 'destructive']);
	});

	it('takes a block with no title at all — the bare category', () => {
		const made = rpc(
			43,
			'add_repeating_block',
			{ weekday: 1, start_time: '09:00', minutes: 120, category: 'work' },
			['schedule:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		rpc(44, 'remove_repeating_block', { id: made.result.structuredContent.id }, [
			'schedule:write',
			'destructive'
		]);
	});

	it('hangs a reminder on a block, lists it, and dismisses it', () => {
		const block = rpc(
			7,
			'add_block',
			{
				date: '2026-03-15',
				title: 'call the dentist',
				start_time: '15:00',
				category: 'work'
			},
			['schedule:write']
		);
		expect(block.result.isError, block.result.content?.[0]?.text).toBe(false);
		const blockId = block.result.structuredContent.id as number;

		const set = rpc(
			8,
			'remind_before_block',
			{
				id: `exceptional:${blockId}`,
				minutes: 15
			},
			['schedule:write']
		);
		expect(set.result.isError, set.result.content?.[0]?.text).toBe(false);
		const reminderId = set.result.structuredContent.id as number;

		const list = rpc(9, 'reminders', {}, ['schedule:read']);
		const mine = list.result.structuredContent.items.find(
			(r: { id: number }) => r.id === reminderId
		);
		expect(mine.message).toContain('call the dentist');

		const off = rpc(10, 'dismiss_reminder', { id: reminderId }, ['schedule:write']);
		expect(off.result.isError).toBe(false);
	});

	it('transcribes a goal, moves its number by delta, and can erase a mistake', () => {
		const made = rpc(
			11,
			'add_goal',
			{
				title: 'apply to twenty companies',
				horizon: 'quarter',
				targetValue: 20,
				unit: 'applications'
			},
			['tasks:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const logged = rpc(12, 'log_goal_progress', { id, delta: 3 }, ['tasks:write']);
		expect(logged.result.structuredContent.currentValue).toBe(3);
		const more = rpc(13, 'log_goal_progress', { id, delta: 2 }, ['tasks:write']);
		expect(more.result.structuredContent.currentValue).toBe(5);

		const both = rpc(14, 'log_goal_progress', { id, delta: 1, value: 9 }, ['tasks:write']);
		expect(both.result.isError).toBe(true);
	});

	it('offers no delete for the precious things — the person does those in the app', () => {
		for (const gone of ['remove_goal', 'remove_goal_area', 'remove_habit', 'remove_person']) {
			const answer = rpc(30, gone, { id: 1 }, ['tasks:write', 'habits:write', 'people:write']);
			expect(answer.result?.isError ?? answer.error !== undefined, gone).toBe(true);
		}
	});

	it('keeps a person, answers whose birthday is coming, and forgets on request', () => {
		// ctx.now is 2026-03-14, so the 19th of March is five days out.
		const made = rpc(
			16,
			'add_person',
			{
				name: 'Tia Carmen',
				relationship: 'family',
				birthday: '--03-19'
			},
			['people:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const coming = rpc(17, 'upcoming_birthdays', { days: 10 }, ['people:read']);
		const carmen = coming.result.structuredContent.items.find((b: { id: number }) => b.id === id);
		expect(carmen.inDays).toBe(5);
		expect(carmen.date).toBe('2026-03-19');

		// people:read does not write, and shopping tokens learn nobody's name.
		const refused = rpc(18, 'people', {}, ['shopping:read']);
		expect(refused.result.isError).toBe(true);
		expect(refused.result.content[0].text).toContain('people:read');
	});

	it('records the day’s wins into the empty lines, and refuses a fourth', () => {
		for (const win of ['ran before work', 'called mum', 'shipped the fix']) {
			const wrote = rpc(20, 'record_win', { content: win, date: '2026-03-14' }, ['notes:write']);
			expect(wrote.result.isError, wrote.result.content?.[0]?.text).toBe(false);
		}
		const fourth = rpc(21, 'record_win', { content: 'one too many', date: '2026-03-14' }, [
			'notes:write'
		]);
		expect(fourth.result.isError).toBe(true);
		expect(fourth.result.content[0].text).toContain('already written');

		const read = rpc(22, 'daily_wins', { date: '2026-03-14' }, ['notes:read']);
		expect(read.result.structuredContent.items.length).toBe(3);
	});

	it('reads a week whole and writes its note', () => {
		const wrote = rpc(
			23,
			'write_review_note',
			{ weekStart: '2026-03-09', note: 'a good week\n\ntoo many meetings' },
			['tasks:write']
		);
		expect(wrote.result.isError, wrote.result.content?.[0]?.text).toBe(false);

		const read = rpc(24, 'weekly_review', { weekStart: '2026-03-09' }, ['tasks:read']);
		expect(read.result.isError).toBe(false);
		expect(read.result.structuredContent.weekStart).toBe('2026-03-09');
		expect(read.result.structuredContent.note).toBe('a good week\n\ntoo many meetings');
	});

	it('refuses to log into a stream that does not exist, naming what does', () => {
		const answer = rpc(25, 'log_data_point', { stream: 'weightt', value: 82 }, ['streams:write']);
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toMatch(/No stream called|no data streams yet/);
	});
});

/**
 * The budget an assistant spends, which is the API's own.
 *
 * "Create a thousand goals named bla" must not run at machine speed: a token
 * making MCP write calls spends the same per-token budget a plugin spends on
 * the REST API, and the sixty-first write in a minute is a sentence about
 * slowing down rather than a sixty-first row.
 */
describe('the call budget', () => {
	it('refuses the write that crosses it, with the retry in the sentence', () => {
		const budgeted = {
			ctx: buildCtx(USER, { tz: 'UTC' }),
			scopes: ['ideas:write'],
			tokenId: 999901
		};
		let refused: string | null = null;

		for (let i = 0; i < 70; i++) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const answer = handleBody(budgeted as any, {
				jsonrpc: '2.0',
				id: i,
				method: 'tools/call',
				params: { name: 'add_idea', arguments: { content: `idea ${i}` } }
			}) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			if (answer.result.isError) {
				refused = answer.result.content[0].text as string;
				break;
			}
		}

		expect(refused).toContain('Too many requests');
	});
});

/**
 * The shopping sections, managed by the same hands that fill them.
 *
 * The rule this pins: anything trivial the app lets a person do gets its MCP
 * tool. Sections are organisation, not history, so — unlike people, habits
 * and goals — deleting one is allowed, and deleting one unfiles its items
 * rather than taking them along.
 */
describe('shopping sections', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('adds one, renames it, flips its food flag, and deletes it — items unharmed', () => {
		const made = rpc(1, 'add_shopping_category', { name: 'Frozen', holdsFood: true }, [
			'shopping:write'
		]);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const renamed = rpc(2, 'change_shopping_category', { id, name: 'Freezer', holdsFood: false }, [
			'shopping:write'
		]);
		expect(renamed.result.isError, renamed.result.content?.[0]?.text).toBe(false);

		const listed = rpc(3, 'shopping_categories', {}, ['shopping:read']);
		const row = listed.result.structuredContent.items.find((c: { id: number }) => c.id === id);
		expect(row.name).toBe('Freezer');
		expect(row.isFood).toBe(false);

		// An item filed under it survives the section's deletion, unfiled.
		const item = rpc(4, 'add_to_shopping_list', { name: 'peas' }, ['shopping:write']);
		expect(item.result.isError, item.result.content?.[0]?.text).toBe(false);

		const gone = rpc(5, 'remove_shopping_category', { id }, ['shopping:write', 'destructive']);
		expect(gone.result.isError).toBe(false);
		const after = rpc(6, 'shopping_list', {}, ['shopping:read']);
		expect(
			after.result.structuredContent.items.some((i: { name: string }) => i.name === 'peas')
		).toBe(true);
	});
});

describe('bills over MCP', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('adds a bill, pays it for a period, and can undo the payment', () => {
		const made = rpc(1, 'add_bill', { name: 'Rent', amount_expected: 120000, due_day: 5 }, [
			'bills:write'
		]);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		// Paid a little over the expected, for a named period.
		const paid = rpc(2, 'pay_bill', { id, amount_paid: 121500, period: '2026-09' }, [
			'bills:write'
		]);
		expect(paid.result.structuredContent.payment.amountExpected).toBe(120000);
		expect(paid.result.structuredContent.payment.amountPaid).toBe(121500);

		// The month summary sees the gap.
		const month = rpc(3, 'month_bills', { month: '2026-09' }, ['bills:read']);
		expect(month.result.structuredContent.paid).toBe(121500);

		// Undo it — the inverse.
		rpc(4, 'unpay_bill', { id, period: '2026-09' }, ['bills:write']);
		const after = rpc(5, 'bill_payments', { id }, ['bills:read']);
		expect(after.result.structuredContent.payments).toHaveLength(0);
	});

	it('paying the same period twice corrects rather than doubling', () => {
		const id = rpc(1, 'add_bill', { name: 'Power', amount_expected: 5000 }, ['bills:write']).result
			.structuredContent.id as number;
		rpc(2, 'pay_bill', { id, amount_paid: 5200, period: '2026-09' }, ['bills:write']);
		rpc(3, 'pay_bill', { id, amount_paid: 4800, period: '2026-09' }, ['bills:write']);
		const rows = rpc(4, 'bill_payments', { id }, ['bills:read']).result.structuredContent.payments;
		expect(rows).toHaveLength(1);
		expect(rows[0].amountPaid).toBe(4800);
	});

	it('a bill with a lead turns up before its due day', () => {
		const id = rpc(
			1,
			'add_bill',
			{ name: 'Rent', amount_expected: 100000, due_day: 10, pay_lead_days: 3 },
			['bills:write']
		).result.structuredContent.id as number;
		expect(id).toBeGreaterThan(0);

		const due = rpc(2, 'bills_due', { from: '2026-03-01', to: '2026-03-31' }, ['bills:read']).result
			.structuredContent.due as { date: string; dueDate: string; paid: boolean }[];
		const rent = due.find((d) => d.dueDate === '2026-03-10')!;
		expect(rent.date).toBe('2026-03-07');
		expect(rent.paid).toBe(false);
	});

	it('a read token cannot write, and there is no delete tool', () => {
		const denied = rpc(1, 'add_bill', { name: 'x' }, ['bills:read']);
		expect(denied.result.isError).toBe(true);
		expect(TOOLS.some((t) => t.name === 'delete_bill')).toBe(false);
	});
});

describe('workouts over MCP', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('adds, reads, changes, does, and puts away — and undoes each', () => {
		// The categories are this account's own rows, so an assistant reads the
		// list before it can file anything under one.
		const categories = rpc(0, 'workout_categories', {}, ['workouts:read']).result.structuredContent
			.categories as {
			id: number;
			name: string;
		}[];
		const strength = categories.find((k) => k.name === 'Strength')!;

		const made = rpc(
			1,
			'add_workout',
			{ title: 'Push day', category_id: strength.id, minutes: 55 },
			['workouts:write']
		);
		expect(made.result.isError, made.result.content?.[0]?.text).toBe(false);
		const id = made.result.structuredContent.id as number;

		const seen = rpc(2, 'workouts', {}, ['workouts:read']);
		const row = seen.result.structuredContent.workouts.find((t: { id: number }) => t.id === id);
		expect(row.title).toBe('Push day');
		expect(row.categoryName).toBe('Strength');

		// Change only the field given.
		rpc(3, 'change_workout', { id, minutes: 60 }, ['workouts:write']);
		const after = rpc(4, 'workouts', {}, ['workouts:read']);
		expect(
			after.result.structuredContent.workouts.find((t: { id: number }) => t.id === id).minutes
		).toBe(60);

		// Done stamps it; archive removes it from the working list; restore brings it back.
		rpc(5, 'workout_done', { id }, ['workouts:write']);
		expect(
			rpc(6, 'workouts', {}, ['workouts:read']).result.structuredContent.workouts.find(
				(t: { id: number }) => t.id === id
			).lastDoneAt
		).not.toBeNull();

		rpc(7, 'archive_workout', { id }, ['workouts:write']);
		expect(
			rpc(8, 'workouts', {}, ['workouts:read']).result.structuredContent.workouts.some(
				(t: { id: number }) => t.id === id
			)
		).toBe(false);
		rpc(9, 'archive_workout', { id, archived: false }, ['workouts:write']);
		expect(
			rpc(10, 'workouts', {}, ['workouts:read']).result.structuredContent.workouts.some(
				(t: { id: number }) => t.id === id
			)
		).toBe(true);
	});

	it('a read token cannot write, and there is no delete tool', () => {
		const denied = rpc(1, 'add_workout', { title: 'x' }, ['workouts:read']);
		expect(denied.result.isError).toBe(true);
		expect(TOOLS.some((t) => t.name === 'delete_workout')).toBe(false);
	});
});

describe('the inventory over MCP', () => {
	/*
	 * The split that gives this its own scope.
	 *
	 * A shopping list is what you are about to buy. An inventory is a map of
	 * somebody's home — which room, which drawer, what is in it — and a widget
	 * given the list should not learn where the spare keys are. So the two
	 * halves share a table and not a permission.
	 */
	it('is not offered to a token that only has the shopping list', () => {
		const offered = call(['shopping:read', 'shopping:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list'
		}).result.tools as { name: string }[];
		const names = offered.map((t) => t.name);

		expect(names).toContain('shopping_list');
		for (const tool of ['locations', 'where_is', 'add_location', 'put_item', 'set_item_fields']) {
			expect(names, `${tool} needs inventory:*`).not.toContain(tool);
		}
	});

	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('builds the tree, files a thing, and answers "where is it"', () => {
		const living = rpc(1, 'add_location', { name: 'Living room' }, ['inventory:write']).result
			.structuredContent.id as number;
		const chest = rpc(2, 'add_location', { name: 'White chest', parent_id: living }, [
			'inventory:write'
		]).result.structuredContent.id as number;
		const drawer = rpc(3, 'add_location', { name: 'First drawer', parent_id: chest }, [
			'inventory:write'
		]).result.structuredContent.id as number;

		rpc(4, 'add_to_shopping_list', { name: 'measuring tape' }, ['shopping:write']);
		const items = rpc(5, 'shopping_list', {}, ['shopping:read']).result.structuredContent.items as {
			id: number;
			name: string;
		}[];
		const tape = items.find((i) => i.name === 'measuring tape')!;

		rpc(6, 'put_item', { id: tape.id, location_id: drawer }, ['inventory:write']);
		rpc(7, 'set_item_fields', { id: tape.id, fields: { length: '5m', kind: 'tailor' } }, [
			'inventory:write'
		]);

		const found = rpc(8, 'where_is', { name: 'tape' }, ['inventory:read']).result.structuredContent
			.things as { name: string; location: string; fields: Record<string, string> }[];
		expect(found[0].location).toBe('Living room › White chest › First drawer');
		expect(found[0].fields).toEqual({ length: '5m', kind: 'tailor' });

		// Unfiling is the inverse of filing.
		rpc(9, 'put_item', { id: tape.id }, ['inventory:write']);
		const unfiled = rpc(10, 'where_is', { name: 'tape' }, ['inventory:read']).result
			.structuredContent.things as { location: string | null }[];
		expect(unfiled[0].location).toBeNull();
	});

	it('a location refuses to be put inside itself, and removal lifts children', () => {
		const a = rpc(1, 'add_location', { name: 'Garage' }, ['inventory:write']).result
			.structuredContent.id as number;
		const b = rpc(2, 'add_location', { name: 'Shelf', parent_id: a }, ['inventory:write']).result
			.structuredContent.id as number;

		const refused = rpc(3, 'change_location', { id: a, parent_id: b }, ['inventory:write']);
		expect(refused.result.isError).toBe(true);

		rpc(4, 'remove_location', { id: a }, ['inventory:write', 'destructive']);
		const tree = rpc(5, 'locations', {}, ['inventory:read']).result.structuredContent.locations as {
			id: number;
			name: string;
		}[];
		expect(tree.some((n) => n.id === b)).toBe(true); // the shelf rose to the top
	});
});

/**
 * Deleting is not the same grant as writing.
 *
 * A write scope used to be both: `tasks:write` let a token append a todo and
 * let it remove one for good. Different damage — a wrong write is data that is
 * wrong, a wrong delete is data that is gone — so the deleting tools demand
 * the `destructive` grant on top of the room's own write scope, and the preset
 * everybody presses does not carry it.
 */
describe('the destructive grant', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('every deleting tool is refused on the write scope alone, naming the grant', () => {
		for (const t of TOOLS.filter((t) => t.destroys)) {
			// The refusal comes before the tool runs, so a made-up id is fine.
			const answer = rpc(1, t.name, { id: 999_999 }, [t.scope]);
			expect(answer.result.isError, t.name).toBe(true);
			expect(answer.result.content[0].text, t.name).toContain('destructive');
		}
	});

	it('and is not offered to a token that cannot call it', () => {
		const offered = (scopes: string[]) =>
			call(scopes, { jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map(
				(t: { name: string }) => t.name
			);

		expect(offered(['tasks:write'])).not.toContain('drop_todo');
		expect(offered(['tasks:write', 'destructive'])).toContain('drop_todo');
	});

	it('with the grant, a delete still goes through', () => {
		const made = rpc(1, 'add_todo', { title: 'a passing thought' }, ['tasks:write']);
		const id = made.result.structuredContent.id as number;

		const dropped = rpc(2, 'drop_todo', { id }, ['tasks:write', 'destructive']);
		expect(dropped.result.isError, dropped.result.content?.[0]?.text).toBe(false);

		const list = rpc(3, 'todos', {}, ['tasks:read']);
		expect(list.result.structuredContent.items.some((t: { id: number }) => t.id === id)).toBe(
			false
		);
	});

	it('destructiveHint marks exactly the gated tools', () => {
		const everything = [...new Set(TOOLS.map((t) => t.scope)), 'destructive'];
		const listed = call(everything, { jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools;

		const hinted = listed
			.filter((t: { annotations: { destructiveHint: boolean } }) => t.annotations.destructiveHint)
			.map((t: { name: string }) => t.name)
			.sort();
		const gated = TOOLS.filter((t) => t.destroys)
			.map((t) => t.name)
			.sort();

		expect(hinted).toEqual(gated);
		expect(gated.length).toBeGreaterThan(0);
	});

	it('every deleting tool is also a writing tool', () => {
		for (const t of TOOLS.filter((t) => t.destroys)) {
			expect(t.writes, t.name).toBe(true);
		}
	});

	it('the assistant preset does not hand it over; the wider one does', async () => {
		const { ASSISTANT_SCOPES, ASSISTANT_SCOPES_DESTRUCTIVE } =
			await import('../src/lib/server/mcp/tools');

		expect(ASSISTANT_SCOPES).not.toContain('destructive');
		expect(ASSISTANT_SCOPES_DESTRUCTIVE).toContain('destructive');
		expect(ASSISTANT_SCOPES_DESTRUCTIVE.slice(0, -1)).toEqual(ASSISTANT_SCOPES);
	});
});

/**
 * Every mutation answers with what it replaced.
 *
 * `{ ok: true }` tells a model nothing it can undo from. The answer to a write
 * carries `before` and `after` — the subject as it was and as it is — so a bad
 * call is reversible from the transcript rather than from a backup, which life
 * data does not get a CI to stand in for. Assembled by the protocol layer, not
 * per tool, so a tool added next year cannot forget it.
 */
describe('the before and the after', () => {
	const rpc = (id: number, name: string, args: Record<string, unknown>, scopes: string[]) =>
		call(scopes, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

	it('a change reports the state it replaced, and the one it made', () => {
		const made = rpc(1, 'add_todo', { title: 'water the plants' }, ['tasks:write']);
		const id = made.result.structuredContent.id as number;

		const changed = rpc(2, 'change_todo', { id, title: 'water every plant' }, ['tasks:write']);
		const answer = changed.result.structuredContent;
		expect(answer.before.title).toBe('water the plants');
		expect(answer.after.title).toBe('water every plant');
	});

	it('a delete answers with the whole row, so it can be put back from the answer', () => {
		const made = rpc(1, 'add_todo', { title: 'a passing errand', notes: 'by the station' }, [
			'tasks:write'
		]);
		const id = made.result.structuredContent.id as number;

		const dropped = rpc(2, 'drop_todo', { id }, ['tasks:write', 'destructive']);
		const answer = dropped.result.structuredContent;
		expect(answer.before.title).toBe('a passing errand');
		expect(answer.before.notes).toBe('by the station');
		// Gone means gone: the after is the honest null.
		expect(answer.after).toBe(null);
	});

	it('a create has nothing before it, and says so', () => {
		const made = rpc(1, 'add_todo', { title: 'a fresh thought' }, ['tasks:write']);
		const answer = made.result.structuredContent;
		expect(answer).toHaveProperty('before');
		expect(answer.before).toBe(null);
	});

	it('a read carries no before — it replaced nothing', () => {
		const list = rpc(1, 'todos', {}, ['tasks:read']);
		expect(list.result.structuredContent).not.toHaveProperty('before');
	});

	it('every deleting tool can answer with the row it removes', () => {
		for (const t of TOOLS.filter((t) => t.destroys)) {
			expect(
				t.subject,
				`${t.name} has no subject, so its delete answers with nothing`
			).toBeDefined();
		}
	});
});
