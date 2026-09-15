import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * A key tied to one notebook.
 *
 * Scopes answer "what may this key do" for the whole account, and the thing
 * people want to hand an assistant is narrower than any scope can say: work on
 * *this* project with me. A confined key is that — a kind of thing and which
 * one — and it works by narrowing the listing every reference resolves
 * against, rather than by a filter each tool has to remember.
 *
 * What these are about, in order: that the confined key can do its job inside
 * the notebook, that it cannot see or touch anything outside it, that asking
 * about another notebook is answered about its own rather than refused (a
 * refusal that depended on the other notebook existing would be a way to ask
 * what exists), and that the tool list it is shown is exactly what it can use.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let visibleTools: typeof import('../src/lib/server/mcp/protocol').visibleTools;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let SCOPES: typeof import('../src/lib/server/services/tokens').SCOPES;

/** The notebook the key is tied to, and one it must never learn about. */
let mine = 0;
let other = 0;
const inside: Record<string, number> = {};
const outside: Record<string, number> = {};

const ctx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

function call(tool: string, args: Record<string, unknown>, confined = true) {
	const caller = {
		ctx: ctx(),
		scopes: Object.keys(SCOPES),
		...(confined ? { confinement: { kind: 'notebook', id: mine } } : {})
	};
	const answer = handleBody(caller as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: tool, arguments: args }
	}) as {
		error?: unknown;
		result?: { isError?: boolean; structuredContent?: unknown; content?: unknown };
	};
	return answer;
}

/** A tool that refused, and a name that is not a tool: both are "no". */
const failed = (answer: ReturnType<typeof call>) =>
	Boolean(answer.error) || Boolean(answer.result?.isError);
const said = (answer: ReturnType<typeof call>) => JSON.stringify(answer.result ?? answer);

beforeAll(async () => {
	({ handleBody, visibleTools } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));

	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createTodo } = await import('../src/lib/services/todos');
	const { createGoal } = await import('../src/lib/services/goals');
	const { createEntry } = await import('../src/lib/services/diary');
	const idOf = (made: unknown) => (typeof made === 'number' ? made : (made as { id: number }).id);

	mine = idOf(createNotebook(ctx(), { title: 'The flat' }));
	other = idOf(createNotebook(ctx(), { title: 'Private' }));

	inside.todo = idOf(createTodo(ctx(), { title: 'call the plumber', notebookId: mine }));
	inside.goal = idOf(
		createGoal(ctx(), { title: 'rewire the kitchen', horizon: 'month', notebookId: mine })
	);
	inside.note = idOf(createEntry(ctx(), { content: 'the boiler is from 1998', notebookId: mine }));

	outside.todo = idOf(createTodo(ctx(), { title: 'a private errand' }));
	outside.goal = idOf(createGoal(ctx(), { title: 'a private goal', horizon: 'year' }));
	outside.note = idOf(createEntry(ctx(), { content: 'a private thought' }));
	outside.notebookTodo = idOf(
		createTodo(ctx(), { title: 'somebody else’s project', notebookId: other })
	);
});

describe('what a key tied to one notebook can do', () => {
	it('reads the notebook’s own tasks', () => {
		const answer = call('todos', {});
		expect(failed(answer)).toBe(false);
		expect(said(answer)).toContain('call the plumber');
	});

	it('writes into it, without being told which notebook', () => {
		const answer = call('add_todo', { title: 'get a quote' });
		expect(failed(answer)).toBe(false);

		const back = said(call('todos', {}));
		expect(back).toContain('get a quote');
	});

	it('finishes one of its own', () => {
		expect(failed(call('finish_todo', { id: inside.todo }))).toBe(false);
	});

	it('reads and writes its notes and its goals', () => {
		expect(said(call('notebook_notes', { id: mine }))).toContain('boiler');
		expect(failed(call('write_entry', { content: 'the electrician comes Tuesday' }))).toBe(false);
		expect(failed(call('change_goal', { id: inside.goal, notes: 'quotes first' }))).toBe(false);
	});
});

describe('what it cannot do', () => {
	it('cannot touch a task that is not in the notebook', () => {
		const answer = call('finish_todo', { id: outside.todo });
		expect(failed(answer)).toBe(true);
	});

	it('cannot touch one in a different notebook', () => {
		expect(failed(call('finish_todo', { id: outside.notebookTodo }))).toBe(true);
	});

	it('cannot read a goal or a note from outside', () => {
		expect(failed(call('change_goal', { id: outside.goal, notes: 'x' }))).toBe(true);
		expect(failed(call('archive_note', { id: outside.note }))).toBe(true);
	});

	it('cannot ask the account questions — only the notebook', () => {
		// `diary`, `week`, `goals` and the rest are about the whole account and
		// name nothing, so there is no narrowing that would make them safe.
		for (const tool of ['diary', 'goals', 'shopping_list', 'habits', 'today'])
			expect(failed(call(tool, {})), `${tool} answered a confined key`).toBe(true);
	});

	it('cannot reach a room the confinement says nothing about', () => {
		expect(failed(call('tick_bought', { id: 1 }))).toBe(true);
		expect(failed(call('change_bill', { id: 1 }))).toBe(true);
	});

	it('is not even shown the tools it cannot call', () => {
		const offered = visibleTools({
			ctx: ctx(),
			scopes: Object.keys(SCOPES),
			confinement: { kind: 'notebook', id: mine }
		} as never).map((t: { name: string }) => t.name);

		expect(offered).toContain('todos');
		expect(offered).toContain('add_todo');
		expect(offered).not.toContain('diary');
		expect(offered).not.toContain('tick_bought');
	});
});

describe('a tool that also takes ids from outside', () => {
	/*
	 * `link_to_goal` hangs to-dos and repeating blocks on a goal. A notebook
	 * holds to-dos and not repeating blocks, so the tool is offered — its goal
	 * is required and its lists are not — and the half that reaches outside is
	 * refused at the id rather than at the door.
	 */
	it('is offered, and works for the part that is inside', () => {
		expect(failed(call('link_to_goal', { goalId: inside.goal, todoIds: [inside.todo] }))).toBe(
			false
		);
	});

	it('refuses a to-do from another notebook in the same call', () => {
		expect(
			failed(call('link_to_goal', { goalId: inside.goal, todoIds: [outside.notebookTodo] }))
		).toBe(true);
	});

	it('refuses a repeating block, which a notebook has none of', () => {
		expect(failed(call('link_to_goal', { goalId: inside.goal, slotIds: [1] }))).toBe(true);
	});
});

describe('asking about another notebook', () => {
	/*
	 * Answered about its own, rather than refused.
	 *
	 * A refusal here would depend on whether the other notebook exists, which
	 * makes the refusal itself an answer: try ids until one comes back
	 * differently and you have learned what the account has. Pinning the
	 * argument means every id gets the same treatment, including one that is
	 * nobody's.
	 */
	it('is answered about its own', () => {
		const asked = said(call('notebook_notes', { id: other }));
		const own = said(call('notebook_notes', { id: mine }));
		expect(asked).toEqual(own);
	});

	it('cannot file a new task into another notebook', () => {
		expect(failed(call('add_todo', { title: 'sneaky', notebookId: other }))).toBe(false);

		// It landed in the confinement, not where it was asked to go.
		expect(said(call('todos', {}))).toContain('sneaky');
		expect(said(call('todos', {}, false))).toContain('sneaky');
		expect(
			said(call('notebook_notes', { id: other }, false)).includes('sneaky'),
			'it reached the other notebook'
		).toBe(false);
	});

	it('cannot move one of its own tasks out', () => {
		expect(failed(call('change_todo', { id: inside.todo, notebookId: other }))).toBe(false);
		// Still in the notebook it started in: a confined key cannot post
		// something out through the letterbox.
		expect(said(call('todos', {}))).toContain('call the plumber');
	});

	it('says nothing different for a notebook that does not exist', () => {
		const nobodys = said(call('notebook_notes', { id: 987654 }));
		expect(nobodys).toEqual(said(call('notebook_notes', { id: other })));
	});
});

describe('when the notebook is gone', () => {
	/*
	 * A key outlives the thing it was made for, and what it must not do then is
	 * widen. The reach is "the rows inside notebook 4"; with no notebook 4 that
	 * is no rows, so every id fails to resolve and the key is inert rather than
	 * loose in the account.
	 */
	it('the key stops working rather than falling back to the account', async () => {
		const { deleteNotebook } = await import('../src/lib/services/notebooks');
		const gone = (() => {
			const made = call('add_todo', { title: 'before it went' });
			return made;
		})();
		expect(failed(gone)).toBe(false);

		deleteNotebook(ctx(), mine);

		expect(failed(call('todos', {}))).toBe(true);
		expect(failed(call('add_todo', { title: 'after it went' }))).toBe(true);
	});
});

describe('a key tied to a kind this build no longer knows', () => {
	it('is refused everything, rather than treated as untied', () => {
		const caller = {
			ctx: ctx(),
			scopes: Object.keys(SCOPES),
			confinement: { kind: 'album', id: 1 }
		};
		const answer = handleBody(caller as never, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'todos', arguments: {} }
		}) as { error?: unknown; result?: { isError?: boolean } };

		expect(Boolean(answer.error) || Boolean(answer.result?.isError)).toBe(true);
	});
});

describe('a key that is not confined', () => {
	it('still reaches the whole account', () => {
		const answer = call('todos', {}, false);
		expect(failed(answer)).toBe(false);
		expect(said(answer)).toContain('a private errand');
	});
});
