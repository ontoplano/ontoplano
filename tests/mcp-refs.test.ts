import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * Every id a tool takes is declared, so nothing has to remember to check it.
 *
 * A tool that names a thing by number can reach a row. What decides whether it
 * reaches the right one used to be the service it calls, filtering by
 * `user_id` in each query it writes — a habit repeated across four rooms and
 * sixty-odd call sites. `refs` replaces the habit with a declaration: the tool
 * says "this argument names a to-do", and the dispatcher finds that to-do
 * among the ones this caller can already list. Reaching across an account
 * stops being checked and starts being impossible.
 *
 * This is the guard that keeps it true as the surface grows. It fails a tool
 * that takes an id-shaped argument and has not said what kind of thing it
 * names — which is the moment to say it, rather than a review three months
 * later.
 *
 * While the migration runs, the tools not yet declared are listed in
 * `UNDECLARED` below. The list only ever shrinks: a name leaves it when the
 * tool is migrated, and nothing may be added — a new tool declares its refs on
 * the day it is written.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let referenceLike: typeof import('../src/lib/server/mcp/refs').referenceLike;
let valuesAt: typeof import('../src/lib/server/mcp/refs').valuesAt;
let KINDS: typeof import('../src/lib/server/mcp/refs').KINDS;
let resolveRef: typeof import('../src/lib/server/mcp/refs').resolveRef;
let assertRefs: typeof import('../src/lib/server/mcp/refs').assertRefs;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	({ referenceLike, valuesAt, KINDS, assertRefs, resolveRef } =
		await import('../src/lib/server/mcp/refs'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

/** Every argument path the schema reads as naming a thing — derived, never listed. */
function idArgumentsOf(tool: (typeof TOOLS)[number]): string[] {
	return referenceLike(tool.input, new Set(TOOLS.map((one) => one.name)));
}

/** Every path a schema has, nested ones spelled the way a `Ref` spells them. */
function pathsOf(node: unknown, path = ''): string[] {
	type Node = { type?: unknown; properties?: Record<string, Node>; items?: Node };
	const out: string[] = [];
	for (const [name, child] of Object.entries((node as Node)?.properties ?? {})) {
		const at = path ? `${path}.${name}` : name;
		out.push(at);
		if (child.type === 'object') out.push(...pathsOf(child, at));
		if (child.type === 'array' && child.items?.type === 'object')
			out.push(...pathsOf(child.items, `${at}[]`));
	}
	return out;
}

describe('the ids a tool takes', () => {
	it('are declared, every one of them', () => {
		const missing: string[] = [];

		for (const tool of TOOLS) {
			const declared = new Set([
				...(tool.refs ?? []).map((ref) => ref.arg),
				...(tool.opaque ?? [])
			]);
			const undeclared = idArgumentsOf(tool).filter((name) => !declared.has(name));
			if (undeclared.length) missing.push(`${tool.name} (${undeclared.join(', ')})`);
		}

		expect(missing, 'these tools take an id without declaring what it names').toEqual([]);
	});

	it('are a real share of the surface, so a broken sweep shows up as a failure', () => {
		const naming = TOOLS.filter((tool) => idArgumentsOf(tool).length);
		expect(naming.length, 'no tools take an id any more?').toBeGreaterThan(50);
	});

	it('never names a kind that does not exist', () => {
		for (const tool of TOOLS)
			for (const ref of tool.refs ?? [])
				expect(Object.keys(KINDS), `${tool.name} names an unknown kind`).toContain(ref.kind);
	});

	it('are only ever declared for arguments the tool actually takes', () => {
		for (const tool of TOOLS)
			for (const ref of tool.refs ?? [])
				expect(
					pathsOf(tool.input),
					`${tool.name} declares ${ref.arg}, which it does not take`
				).toContain(ref.arg);
	});

	it('are caught however they are spelled, and wherever they sit', () => {
		const names = new Set(['recipes', 'locations']);
		const found = referenceLike(
			{
				properties: {
					parent_id: { type: 'integer' },
					ranOutOf: { type: 'array', items: { type: 'integer' }, description: 'Item ids.' },
					home: { type: 'integer', description: 'The place, from `locations`.' },
					lines: {
						type: 'array',
						items: { type: 'object', properties: { recipeId: { type: 'integer' } } }
					},
					where: {
						type: 'object',
						properties: { dish: { type: 'integer', description: 'As `recipes` gives it.' } }
					},
					minutes: { type: 'integer', description: 'How long it takes.' },
					only: { type: 'array', items: { type: 'integer' }, description: 'Counting from 0.' }
				}
			},
			names
		);
		expect(found.sort()).toEqual([
			'home',
			'lines[].recipeId',
			'parent_id',
			'ranOutOf',
			'where.dish'
		]);
	});

	it('opaque ones are ones the tool actually takes', () => {
		for (const tool of TOOLS)
			for (const arg of tool.opaque ?? []) expect(pathsOf(tool.input), tool.name).toContain(arg);
	});
});

describe('a path into the arguments', () => {
	it('reaches plain values, lists, and fields of objects in a list', () => {
		expect(valuesAt({ id: 3 }, 'id')).toEqual([3]);
		expect(valuesAt({ ids: [1, 2] }, 'ids')).toEqual([1, 2]);
		expect(valuesAt({ lines: [{ itemId: 4 }, { itemId: 5 }, 'x'] }, 'lines[].itemId')).toEqual([
			4, 5
		]);
		expect(valuesAt({ where: { ids: [6] } }, 'where.ids')).toEqual([6]);
		expect(valuesAt({}, 'where.ids')).toEqual([]);
	});
});

/**
 * What resolving actually does, at the edges.
 *
 * The interesting cases are all refusals, and they have to be the same refusal:
 * a missing id, a nonsense id, and somebody else's id are one answer, because
 * three different answers is a way to ask what exists.
 */
describe('resolving one', () => {
	const ctx = () => buildCtx(OWNER, { tz: 'UTC' });

	it('answers null for an id that is nobody’s', () => {
		expect(resolveRef(ctx(), { arg: 'id', kind: 'todo' }, { id: 987654 })).toBeNull();
	});

	it('answers null for an argument that is not there', () => {
		expect(resolveRef(ctx(), { arg: 'id', kind: 'todo' }, {})).toBeNull();
	});

	it('answers null for something that is not a number at all', () => {
		for (const id of ['', 'x', null, undefined, {}, [], 1.5, NaN, Infinity])
			expect(resolveRef(ctx(), { arg: 'id', kind: 'todo' }, { id })).toBeNull();
	});

	it('finds one that is the caller’s own', async () => {
		const { createTodo } = await import('../src/lib/services/todos');
		const made = createTodo(ctx(), { title: 'mine to find' }) as { id: number } | number;
		const id = typeof made === 'number' ? made : made.id;

		expect(resolveRef(ctx(), { arg: 'id', kind: 'todo' }, { id })).toMatchObject({ id });
	});
});

/**
 * The gate, on its own.
 *
 * The sweep in `mcp-idor.test.ts` asks whether any tool crosses the fence, and
 * a green sweep is the services' filtering and this gate agreeing. These are
 * about the gate by itself: that it refuses a foreign id before anything runs,
 * that it says the same thing for a foreign id as for one that never existed,
 * and that it does not refuse what it should let through — an optional
 * argument left out is not an id that failed to resolve.
 */
describe('the gate every call goes through', () => {
	const mine = () => buildCtx(OWNER, { tz: 'UTC' });
	const theirs = () => buildCtx(STRANGER, { tz: 'UTC' });

	let strangerTodo = 0;
	let strangerNotebook = 0;
	let ownTodo = 0;

	beforeAll(async () => {
		const { createTodo } = await import('../src/lib/services/todos');
		const { createNotebook } = await import('../src/lib/services/notebooks');
		const idOf = (made: unknown) => (typeof made === 'number' ? made : (made as { id: number }).id);

		strangerTodo = idOf(createTodo(theirs(), { title: 'theirs' }));
		strangerNotebook = idOf(createNotebook(theirs(), { title: 'theirs' }));
		ownTodo = idOf(createTodo(mine(), { title: 'mine' }));
	});

	it('refuses an id belonging to somebody else', () => {
		expect(() => assertRefs(mine(), [{ arg: 'id', kind: 'todo' }], { id: strangerTodo })).toThrow(
			/to-do/
		);
	});

	it('says exactly what it says for an id that never existed', () => {
		const foreign = (() => {
			try {
				assertRefs(mine(), [{ arg: 'id', kind: 'todo' }], { id: strangerTodo });
			} catch (e) {
				return String(e);
			}
		})();
		const absent = (() => {
			try {
				assertRefs(mine(), [{ arg: 'id', kind: 'todo' }], { id: 987654 });
			} catch (e) {
				return String(e);
			}
		})();

		expect(foreign).toEqual(absent);
	});

	it('lets an id of the caller’s own through', () => {
		expect(() => assertRefs(mine(), [{ arg: 'id', kind: 'todo' }], { id: ownTodo })).not.toThrow();
	});

	it('lets an optional argument that was left out through', () => {
		for (const args of [{}, { notebookId: null }, { notebookId: '' }])
			expect(() =>
				assertRefs(mine(), [{ arg: 'notebookId', kind: 'notebook' }], args)
			).not.toThrow();
	});

	it('refuses one foreign id hiding in a list of the caller’s own', () => {
		expect(() =>
			assertRefs(mine(), [{ arg: 'todoIds', kind: 'todo' }], { todoIds: [ownTodo, strangerTodo] })
		).toThrow(/to-do/);

		expect(() =>
			assertRefs(mine(), [{ arg: 'todoIds', kind: 'todo' }], { todoIds: [ownTodo] })
		).not.toThrow();
	});

	it('refuses when one of several ids is foreign and the rest are fine', () => {
		// `change_task` moves a to-do into a notebook, so a call carries two ids.
		// Somebody else's notebook with your own to-do is the interesting shape:
		// the first argument is beyond reproach and the call is still a reach.
		expect(() =>
			assertRefs(
				mine(),
				[
					{ arg: 'id', kind: 'todo' },
					{ arg: 'notebookId', kind: 'notebook' }
				],
				{ id: ownTodo, notebookId: strangerNotebook }
			)
		).toThrow(/notebook/);
	});

	it('refuses junk without asking the database about it', () => {
		// Ids are whole and positive; everything else names nothing, including a
		// string that is trying to be a query. `true` is deliberately not here:
		// `Number(true)` is 1, and 1 is a perfectly ordinary id — the shape is
		// caught by the schema, and what this is about is the reach. An empty
		// string is not here either — that is an argument left out, which the
		// test above covers.
		for (const id of [' ', 'x', '1; drop table todo_tasks', 1.5, NaN, Infinity, -1, 0])
			expect(() => assertRefs(mine(), [{ arg: 'id', kind: 'todo' }], { id })).toThrow();
	});
});
