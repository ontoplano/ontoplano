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
let withheldTools: typeof import('../src/lib/server/mcp/protocol').withheldTools;
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
	({ handleBody, visibleTools, withheldTools } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));

	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createTodo } = await import('../src/lib/services/todos');
	const { createGoal } = await import('../src/lib/services/goals');
	const { createEntry } = await import('../src/lib/services/diary');
	const { createItem } = await import('../src/lib/services/inventory');
	const idOf = (made: unknown) => (typeof made === 'number' ? made : (made as { id: number }).id);

	mine = idOf(createNotebook(ctx(), { title: 'The flat' }));
	other = idOf(createNotebook(ctx(), { title: 'Private' }));

	inside.todo = idOf(createTodo(ctx(), { title: 'call the plumber', notebookId: mine }));
	inside.goal = idOf(
		createGoal(ctx(), { title: 'rewire the kitchen', horizon: 'month', notebookId: mine })
	);
	inside.note = idOf(createEntry(ctx(), { content: 'the boiler is from 1998', notebookId: mine }));
	// A notebook holds its subject's shopping now, so a key given the flat can
	// tick the flat's tiles off — and nothing else's.
	inside.item = idOf(createItem(ctx(), { name: 'wall tiles', type: 'someday', notebookId: mine }));

	outside.todo = idOf(createTodo(ctx(), { title: 'a private errand' }));
	outside.goal = idOf(createGoal(ctx(), { title: 'a private goal', horizon: 'year' }));
	outside.note = idOf(createEntry(ctx(), { content: 'a private thought' }));
	outside.notebookTodo = idOf(
		createTodo(ctx(), { title: 'somebody else’s project', notebookId: other })
	);

	/*
	 * A screenshot in each notebook. This is what the confinement screen
	 * promises — "its tasks, its goals, its notes, and the pictures and
	 * recordings in them" — and what a confined key could not reach at all,
	 * because `media` takes a link rather than an id and so declared no reach
	 * for the tool list to judge.
	 */
	const { store } = await import('../src/lib/services/media');
	const gif = (n: number) =>
		Uint8Array.from([
			0x47,
			0x49,
			0x46,
			0x38,
			0x39,
			0x61,
			0x01,
			0x00,
			0x01,
			0x00,
			0x80,
			0x00,
			0x00,
			0xff,
			0xff,
			0xff,
			0x00,
			0x00,
			0x00,
			0x21,
			0xf9,
			0x04,
			0x01,
			0x00,
			0x00,
			0x00,
			0x00,
			0x2c,
			0x00,
			0x00,
			0x00,
			0x00,
			0x01,
			0x00,
			0x01,
			0x00,
			0x00,
			0x02,
			0x02,
			0x44,
			0x01,
			0x00,
			n
		]);
	inside.picture = (await store(ctx(), { bytes: gif(0x3b), filename: 'wall.gif' })).id;
	outside.picture = (await store(ctx(), { bytes: gif(0x3a), filename: 'private.gif' })).id;
	createTodo(ctx(), {
		title: 'the wall',
		notes: `![wall](/media/${inside.picture})`,
		notebookId: mine
	});
	createEntry(ctx(), { content: `![private](/media/${outside.picture})` });
	outside.item = idOf(createItem(ctx(), { name: 'milk', type: 'replenish' }));
});

describe('what a key tied to one notebook can do', () => {
	it('reads the notebook’s own tasks', () => {
		const answer = call('tasks', {});
		expect(failed(answer)).toBe(false);
		expect(said(answer)).toContain('call the plumber');
	});

	it('writes into it, without being told which notebook', () => {
		const answer = call('add_task', { title: 'get a quote' });
		expect(failed(answer)).toBe(false);

		const back = said(call('tasks', {}));
		expect(back).toContain('get a quote');
	});

	it('finishes one of its own', () => {
		expect(failed(call('finish_task', { id: inside.todo }))).toBe(false);
	});

	it('reads and writes its notes and its goals', () => {
		expect(said(call('notebook_notes', { id: mine }))).toContain('boiler');
		expect(failed(call('write_entry', { content: 'the electrician comes Tuesday' }))).toBe(false);
		expect(failed(call('change_goal', { id: inside.goal, notes: 'quotes first' }))).toBe(false);
	});

	/*
	 * The three reads a confined key is likeliest to be missing, named.
	 *
	 * `tasks` being offered says nothing about the rest: these are the ones
	 * that answer "what should I do next", "which notebooks are there" and
	 * "show me that picture", and an assistant without them has to read the
	 * whole list and sort it itself — which is what it was doing, on a key
	 * that was supposed to have them. They are asserted one by one rather than
	 * as a count, so a regression names which one went.
	 */
	it('is offered the reads that make it useful, by name', () => {
		const offered = visibleTools({
			ctx: ctx(),
			scopes: Object.keys(SCOPES),
			confinement: { kind: 'notebook', id: mine }
		} as never).map((t: { name: string }) => t.name);
		for (const name of ['tasks', 'up_next', 'notebooks', 'notebook_notes', 'media'])
			expect(offered, `${name} is missing from a confined key's tool list`).toContain(name);
	});

	it('can actually call the one that says what to do next', () => {
		// Being offered it and being able to call it are two promises, and the
		// second is the one an assistant finds out about.
		expect(failed(call('up_next', {}))).toBe(false);
	});
});

describe('what it cannot do', () => {
	it('cannot touch a task that is not in the notebook', () => {
		const answer = call('finish_task', { id: outside.todo });
		expect(failed(answer)).toBe(true);
	});

	it('cannot touch one in a different notebook', () => {
		expect(failed(call('finish_task', { id: outside.notebookTodo }))).toBe(true);
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

	it('reaches what its notebook holds, and no other room’s rows', () => {
		// The flat's tiles: filed under the notebook this key was given.
		expect(failed(call('tick_bought', { id: inside.item }))).toBe(false);
		// The milk: an ordinary shopping item, filed under nothing.
		expect(failed(call('tick_bought', { id: outside.item }))).toBe(true);
	});

	it('cannot reach a kind that does not live in a notebook at all', () => {
		// Shopping and bills are things a subject accumulates; a person is
		// somebody in your life, and no notebook contains one.
		expect(failed(call('change_person', { id: 1 }))).toBe(true);
	});

	it('is not even shown the tools it cannot call', () => {
		const offered = visibleTools({
			ctx: ctx(),
			scopes: Object.keys(SCOPES),
			confinement: { kind: 'notebook', id: mine }
		} as never).map((t: { name: string }) => t.name);

		expect(offered).toContain('tasks');
		expect(offered).toContain('add_task');
		expect(offered).not.toContain('diary');
		// Offered, because a notebook holds its subject's shopping now.
		expect(offered).toContain('tick_bought');
		// Not offered: people are not filed under a subject.
		expect(offered).not.toContain('change_person');
	});

	/*
	 * The pictures the confinement screen promises.
	 *
	 * `media` reaches a file by the link the writing spells rather than by an
	 * id, so it declares no reach and the usual rule hid it from every confined
	 * key — the one tool whose whole subject is the screenshots in the
	 * notebook. It says `confinesItself` instead, and the two tests below are
	 * what that claim is worth: the notebook's own file, and not another.
	 */
	it('is offered the tool that fetches a picture', () => {
		const offered = visibleTools({
			ctx: ctx(),
			scopes: Object.keys(SCOPES),
			confinement: { kind: 'notebook', id: mine }
		} as never).map((t: { name: string }) => t.name);

		expect(offered).toContain('media');
	});

	it('sees a picture in its own notebook', () => {
		const answer = call('media', { path: `/media/${inside.picture}` });
		expect(failed(answer), said(answer)).toBe(false);
		expect(said(answer)).toContain('image/gif');
	});

	it('and not one that lives anywhere else', () => {
		const answer = call('media', { path: `/media/${outside.picture}` });
		expect(failed(answer), said(answer)).toBe(true);
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
		expect(failed(call('add_task', { title: 'sneaky', notebookId: other }))).toBe(false);

		// It landed in the confinement, not where it was asked to go.
		expect(said(call('tasks', {}))).toContain('sneaky');
		expect(said(call('tasks', {}, false))).toContain('sneaky');
		expect(
			said(call('notebook_notes', { id: other }, false)).includes('sneaky'),
			'it reached the other notebook'
		).toBe(false);
	});

	it('cannot move one of its own tasks out', () => {
		expect(failed(call('change_task', { id: inside.todo, notebookId: other }))).toBe(false);
		// Still in the notebook it started in: a confined key cannot post
		// something out through the letterbox.
		expect(said(call('tasks', {}))).toContain('call the plumber');
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
			const made = call('add_task', { title: 'before it went' });
			return made;
		})();
		expect(failed(gone)).toBe(false);

		deleteNotebook(ctx(), mine);

		expect(failed(call('tasks', {}))).toBe(true);
		expect(failed(call('add_task', { title: 'after it went' }))).toBe(true);
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
			params: { name: 'tasks', arguments: {} }
		}) as { error?: unknown; result?: { isError?: boolean } };

		expect(Boolean(answer.error) || Boolean(answer.result?.isError)).toBe(true);
	});
});

describe('a key that is not confined', () => {
	it('still reaches the whole account', () => {
		const answer = call('tasks', {}, false);
		expect(failed(answer)).toBe(false);
		expect(said(answer)).toContain('a private errand');
	});
});

/*
 * An absence says nothing.
 *
 * A tool missing from the list could be a permission this token does not hold
 * or a feature this build does not have, and an assistant cannot tell those
 * apart — so the careful ones stop and do something worse quietly, and the
 * person never learns their key was narrow. The list says which are held back
 * and what to ask for.
 */
describe('what is being held back', () => {
	it('names the tools a narrow key is not offered, and the grant each needs', () => {
		const narrow = { ctx: ctx(), scopes: ['tasks:read'] };

		const offered = visibleTools(narrow).map((one) => one.name);
		const held = withheldTools(narrow);

		expect(offered).toContain('tasks');
		expect(held.length).toBeGreaterThan(0);
		// Nothing is in both lists, and everything is in one of them.
		expect(held.map((one) => one.name).filter((name) => offered.includes(name))).toEqual([]);

		const writing = held.find((one) => one.name === 'add_task');
		expect(writing?.needs, 'it should say which grant would offer it').toBe('tasks:write');
	});

	it('says destructive where that is the grant that is missing', () => {
		const everythingButDeleting = {
			ctx: ctx(),
			scopes: ['tasks:read', 'tasks:write']
		};

		const held = withheldTools(everythingButDeleting);
		expect(held.find((one) => one.name === 'drop_task')?.needs).toBe('destructive');
	});

	it('holds nothing back from a key that may do everything', async () => {
		const { ASSISTANT_SCOPES } = await import('../src/lib/server/mcp/tools');
		expect(withheldTools({ ctx: ctx(), scopes: [...ASSISTANT_SCOPES, 'destructive'] })).toEqual([]);
	});
});
