import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';
import { baselineArgs, withRef } from './helpers/mcp-baseline';

/** Every tab a notebook can have, for a subject that files one of each. */
const EVERY_TAB = 'notes,tasks,goals,ideas,inventory,ledgers,bills,habits,workouts,recipes';

/**
 * Every reference a tool takes is gated on its own — not only the one the
 * call is about.
 *
 * `cooked_recipe` checked its recipe and then handed `ranOutOf`, a list of
 * inventory ids, straight to a write scoped by account alone: a key tied to
 * one notebook could name its own recipe and put any item in the account back
 * on the shopping list. Nothing crossed accounts, which is why the sweep in
 * `mcp-idor.test.ts` stayed green — it was a key reaching past its notebook.
 *
 * So these substitute one reference at a time, for every reference every
 * tool declares: somebody else's row, and — for a key tied to a notebook — the
 * same person's row filed in a different notebook. Each must be refused, the
 * same way a number nobody owns is, and nothing may change on the way.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const NOBODYS = 987654;
const NOW = new Date('2026-03-14T10:00:00Z');

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let SCOPES: typeof import('../src/lib/server/services/tokens').SCOPES;
let CONFINEMENTS: typeof import('../src/lib/server/mcp/confinement').CONFINEMENTS;
let withinConfinement: typeof import('../src/lib/server/mcp/confinement').withinConfinement;
let reachOf: typeof import('../src/lib/server/mcp/confinement').reachOf;
let confine: typeof import('../src/lib/server/mcp/confinement').confine;
let assertRefs: typeof import('../src/lib/server/mcp/refs').assertRefs;
let argumentProblem: typeof import('../src/lib/server/mcp/arguments').argumentProblem;

/** The notebook the key is tied to, and one it must not reach into. */
let mine = 0;
let other = 0;
/** One of the owner's rows of each kind, filed in the other notebook. */
const elsewhere: Record<string, number> = {};
/** And one filed in the key's own notebook, for the baselines. */
const inside: Record<string, number> = {};
/** One of the stranger's rows of each kind that matters here. */
const theirs: Record<string, number> = {};

let recipe = 0;
let milk = 0;
let tiles = 0;

const WATCHED = [
	'todo_tasks',
	'goals',
	'goal_links',
	'habits',
	'habit_occurrences',
	'notebooks',
	'diary_entries',
	'ledgers',
	'bills',
	'bill_payments',
	'ideas',
	'inventory_items',
	'recipes',
	'recipe_items',
	'locations',
	'workouts',
	'workout_sessions',
	'workout_categories',
	'finance_transactions'
];

function snapshot(user: string): string {
	return JSON.stringify(
		WATCHED.map((table) => [table, database.all(`select * from ${table} where user_id = ?`, user)])
	);
}

const ctx = (user = OWNER) => buildCtx(user, { tz: 'UTC', now: NOW });

function call(tool: string, args: Record<string, unknown>, confined: boolean) {
	const caller = {
		ctx: ctx(),
		scopes: Object.keys(SCOPES),
		...(confined ? { confinement: { kind: 'notebook', id: mine } } : {})
	};
	return handleBody(caller as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: tool, arguments: args }
	}) as { error?: unknown; result?: { isError?: boolean; structuredContent?: unknown } };
}

const failed = (answer: ReturnType<typeof call>) =>
	Boolean(answer.error) || Boolean(answer.result?.isError);

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));
	({ CONFINEMENTS, withinConfinement, reachOf, confine } =
		await import('../src/lib/server/mcp/confinement'));
	({ assertRefs } = await import('../src/lib/server/mcp/refs'));
	({ argumentProblem } = await import('../src/lib/server/mcp/arguments'));

	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createTodo } = await import('../src/lib/services/todos');
	const { createGoal } = await import('../src/lib/services/goals');
	const { createEntry } = await import('../src/lib/services/diary');
	const { createIdea } = await import('../src/lib/services/ideas');
	const { createItem, listItems } = await import('../src/lib/services/inventory');
	const { createHabit } = await import('../src/lib/services/habits');
	const { createLedger } = await import('../src/lib/services/ledgers');
	const { createBill, markPaid } = await import('../src/lib/services/bills');
	const { recordMovement } = await import('../src/lib/services/statements');
	const line = (ledgerId: number, description: string) =>
		recordMovement(ctx(), { ledgerId, occurredOn: '2026-03-10', amountCents: -500, description })
			.id;
	const { createWorkout, createWorkoutCategory } = await import('../src/lib/services/workouts');
	const { createRecipe, addIngredient } = await import('../src/lib/services/recipes');
	const { createLocation } = await import('../src/lib/services/locations');
	const idOf = (made: unknown): number =>
		typeof made === 'number' ? made : (made as { id: number }).id;
	const itemNamed = (c: ReturnType<typeof ctx>, name: string) =>
		listItems(c).find((one) => one.name === name)!.id;

	const me = ctx();
	mine = idOf(createNotebook(me, { title: 'The kitchen', modules: EVERY_TAB }));
	other = idOf(createNotebook(me, { title: 'The renovation', modules: EVERY_TAB }));

	// The notebook's recipe, whose one ingredient is unfiled — as ingredients
	// made from a recipe's text are.
	recipe = idOf(createRecipe(me, { title: 'porridge', notebookId: mine }));
	addIngredient(me, recipe, { name: 'milk' });
	milk = itemNamed(me, 'milk');

	// The same kinds again in the key's own notebook, so a baseline can name
	// one of each.
	const inMine = { notebookId: mine };
	inside.recipe = recipe;
	inside.ingredient = milk;
	inside.todo = idOf(createTodo(me, { title: 'descale the kettle', ...inMine }));
	inside.goal = idOf(createGoal(me, { title: 'eat in more', horizon: 'month', ...inMine }));
	inside.note = idOf(createEntry(me, { content: 'shelf plan', ...inMine }));
	inside.idea = idOf(createIdea(me, { content: 'herb box', ...inMine }));
	createItem(me, { name: 'flour', type: 'replenish', ...inMine });
	inside.item = itemNamed(me, 'flour');
	inside.habit = idOf(createHabit(me, { name: 'wipe the hob', ...inMine }));
	inside.ledger = idOf(createLedger(me, { name: 'groceries', ...inMine }));
	inside.movement = line(inside.ledger, 'the market');
	inside.bill = idOf(createBill(me, { name: 'gas', dueDay: 9, ...inMine }));
	inside.billPayment = markPaid(me, inside.bill, { period: '2026-03' }).id;
	inside.workout = idOf(createWorkout(me, { title: 'carry shopping', ...inMine }));

	// Everything below lives in the other notebook.
	const inOther = { notebookId: other };
	elsewhere.todo = idOf(createTodo(me, { title: 'sand the floor', ...inOther }));
	elsewhere.goal = idOf(createGoal(me, { title: 'finish it', horizon: 'month', ...inOther }));
	elsewhere.note = idOf(createEntry(me, { content: 'floor plan', ...inOther }));
	elsewhere.idea = idOf(createIdea(me, { content: 'skylight', ...inOther }));
	createItem(me, { name: 'tiles', type: 'someday', ...inOther });
	tiles = itemNamed(me, 'tiles');
	elsewhere.item = tiles;
	elsewhere.habit = idOf(createHabit(me, { name: 'sweep up', ...inOther }));
	elsewhere.ledger = idOf(createLedger(me, { name: 'renovation fund', ...inOther }));
	elsewhere.movement = line(elsewhere.ledger, 'the builder');
	elsewhere.bill = idOf(createBill(me, { name: 'builder', dueDay: 5, ...inOther }));
	elsewhere.billPayment = markPaid(me, elsewhere.bill, { period: '2026-03' }).id;
	elsewhere.workout = idOf(createWorkout(me, { title: 'carry bricks', ...inOther }));
	elsewhere.recipe = idOf(createRecipe(me, { title: 'site lunch', ...inOther }));
	addIngredient(me, elsewhere.recipe, { name: 'bread' });
	elsewhere.ingredient = itemNamed(me, 'bread');

	// The stranger's rows for the kinds whose references were undeclared.
	const them = ctx(STRANGER);
	theirs.location = idOf(createLocation(them, { name: 'their shed' }));
	theirs.workout = idOf(createWorkout(them, { title: 'their run' }));
	theirs.workoutCategory = idOf(createWorkoutCategory(them, 'their group'));
	theirs.ledger = idOf(createLedger(them, { name: 'their account' }));
	createItem(them, { name: 'their milk', type: 'replenish' });
	theirs.item = itemNamed(them, 'their milk');
	theirs.recipe = idOf(createRecipe(them, { title: 'their porridge' }));
	addIngredient(them, theirs.recipe, { itemId: theirs.item });
	theirs.ingredient = theirs.item;

	// Some listings seed defaults the first time they are read — an account's
	// exercise groups. Read each kind once now, so the snapshots below see
	// only what a call does.
	const { KINDS } = await import('../src/lib/server/mcp/refs');
	for (const kind of Object.values(KINDS)) kind.rows(ctx());
});

describe('the rows this stands on', () => {
	it('are filed where the test says, and the other notebook holds every kind a notebook can', () => {
		const reach = reachOf({ kind: 'notebook', id: other });
		const contained = Object.keys(CONFINEMENTS.notebook.contains).filter((k) => k !== 'notebook');

		for (const kind of contained) {
			expect(elsewhere[kind], `nothing of kind ${kind} seeded elsewhere`).toBeDefined();
			expect(
				reach(kind as never, ctx())?.some((row) => row.id === elsewhere[kind]),
				`${kind} ${elsewhere[kind]} is not in the other notebook`
			).toBe(true);
		}
		expect(
			reachOf({ kind: 'notebook', id: mine })('ingredient', ctx())?.map((row) => row.id)
		).toEqual([milk]);
	});
});

describe('cooking a recipe through a key tied to its notebook', () => {
	it('puts its own ingredient back on the list', () => {
		database.exec('update inventory_items set bought = 1 where id = ?', milk);
		expect(failed(call('cooked_recipe', { id: recipe, ranOutOf: [milk] }, true))).toBe(false);
		expect(database.all('select bought from inventory_items where id = ?', milk)).toEqual([
			{ bought: 0 }
		]);
	});

	it('cannot name an item filed in another notebook', () => {
		database.exec('update inventory_items set bought = 1 where id = ?', tiles);
		const before = snapshot(OWNER);
		expect(failed(call('cooked_recipe', { id: recipe, ranOutOf: [tiles] }, true))).toBe(true);
		expect(snapshot(OWNER)).toEqual(before);
	});

	it('cannot name another notebook’s ingredient, even alongside its own', () => {
		const before = snapshot(OWNER);
		const answer = call(
			'cooked_recipe',
			{ id: recipe, ranOutOf: [milk, elsewhere.ingredient] },
			true
		);
		expect(failed(answer)).toBe(true);
		expect(snapshot(OWNER)).toEqual(before);
	});
});

describe('cooking a recipe with a key that reaches the whole account', () => {
	it('still cannot name an item that is not one of this recipe’s ingredients', () => {
		const before = snapshot(OWNER);
		expect(failed(call('cooked_recipe', { id: recipe, ranOutOf: [tiles] }, false))).toBe(true);
		expect(
			failed(call('cooked_recipe', { id: recipe, ranOutOf: [elsewhere.ingredient] }, false))
		).toBe(true);
		// Refused whole: the recipe was not marked cooked either.
		expect(snapshot(OWNER)).toEqual(before);
	});

	it('cannot name somebody else’s item, and is told what it is told for no item', () => {
		const before = snapshot(STRANGER);
		const foreign = call('cooked_recipe', { id: recipe, ranOutOf: [theirs.item] }, false);
		const absent = call('cooked_recipe', { id: recipe, ranOutOf: [NOBODYS] }, false);
		expect(failed(foreign)).toBe(true);
		expect(JSON.stringify(foreign)).toEqual(JSON.stringify(absent));
		expect(snapshot(STRANGER)).toEqual(before);
	});

	it('refuses it in the service too, for a caller that is not the MCP gate', async () => {
		const { cooked } = await import('../src/lib/services/recipes');
		expect(() => cooked(ctx(), recipe, [tiles])).toThrow(/ingredient/);
		expect(() => cooked(ctx(), recipe, [theirs.item])).toThrow(/ingredient/);
	});
});

describe('every declared reference, one at a time', () => {
	it('refuses somebody else’s row the way it refuses a row nobody has', () => {
		const leaked: string[] = [];
		const byShape: string[] = [];
		const differed: string[] = [];
		let checked = 0;

		for (const tool of TOOLS)
			for (const ref of tool.refs ?? []) {
				const id = theirs[ref.kind];
				if (id === undefined) continue; // the full sweep in mcp-idor covers the rest
				// From arguments that are otherwise accepted, so a refusal is the
				// reference's and not a missing argument's.
				const base = baselineArgs(
					tool,
					(kind) => inside[kind] ?? (kind === 'notebook' ? mine : undefined)
				);
				if (!base || argumentProblem(tool.input, base)) continue;
				const before = snapshot(STRANGER) + snapshot(OWNER);
				const foreign = call(tool.name, withRef(tool, base, ref.arg, id), false);
				const absent = call(tool.name, withRef(tool, base, ref.arg, NOBODYS), false);
				checked++;

				if (snapshot(STRANGER) + snapshot(OWNER) !== before) leaked.push(`${tool.name}.${ref.arg}`);
				else if (foreign.error) byShape.push(`${tool.name}.${ref.arg}`);
				else if (!failed(foreign)) leaked.push(`${tool.name}.${ref.arg}`);
				else if (JSON.stringify(foreign) !== JSON.stringify(absent))
					differed.push(`${tool.name}.${ref.arg}`);
			}

		expect(checked).toBeGreaterThan(10);
		expect(leaked, 'these references reached a stranger’s row').toEqual([]);
		expect(byShape, 'these were refused by the schema, not by the reference').toEqual([]);
		expect(differed, 'these refused a stranger’s row differently from no row').toEqual([]);
	});

	it('refuses, through a key tied to one notebook, the same person’s row filed in another', () => {
		const confinement = { kind: 'notebook', id: mine } as const;
		const pinnedKind = CONFINEMENTS.notebook.kind;
		const reach = reachOf(confinement);
		const leaked: string[] = [];
		const byShape: string[] = [];
		const noBaseline: string[] = [];
		let checked = 0;

		for (const tool of TOOLS) {
			if (tool.confinesItself || !withinConfinement(confinement, tool)) continue;
			const substituted = (tool.refs ?? []).filter(
				(ref) => ref.kind !== pinnedKind && elsewhere[ref.kind] !== undefined
			);
			if (substituted.length === 0) continue;

			// A baseline inside the key's own notebook, which the key is allowed:
			// otherwise a refusal says nothing about the row swapped in.
			const base = baselineArgs(tool, (kind) => (kind === pinnedKind ? mine : inside[kind]));
			try {
				if (!base || argumentProblem(tool.input, base)) throw new Error('schema');
				const pinned = structuredClone(base);
				confine(confinement as never, tool.refs, tool.input, pinned);
				assertRefs(ctx(), tool.refs, pinned, reach);
			} catch {
				noBaseline.push(tool.name);
				continue;
			}

			for (const ref of substituted) {
				const before = snapshot(OWNER);
				const answer = call(tool.name, withRef(tool, base!, ref.arg, elsewhere[ref.kind]), true);
				checked++;
				if (snapshot(OWNER) !== before) leaked.push(`${tool.name}.${ref.arg}`);
				else if (answer.error) byShape.push(`${tool.name}.${ref.arg}`);
				else if (!failed(answer)) leaked.push(`${tool.name}.${ref.arg}`);
			}
		}

		expect(noBaseline, 'these have no baseline the key is allowed').toEqual([]);
		expect(checked).toBeGreaterThan(20);
		expect(leaked, 'these references reached out of the notebook').toEqual([]);
		expect(byShape, 'these were refused by the schema, not by the reference').toEqual([]);
	});
});

describe('a key tied to a notebook', () => {
	it('is not offered a tool whose only reach into it is optional', () => {
		const offered = TOOLS.filter((tool) =>
			withinConfinement({ kind: 'notebook', id: mine }, tool)
		).map((tool) => tool.name);

		// Each of these, called without its optional id, answers about the whole
		// account — `movements` reads every ledger.
		for (const name of [
			'movements',
			'statement_months',
			'spending_by_category',
			'workout_sessions'
		])
			expect(offered).not.toContain(name);
	});

	it('is offered `recipes` and `tick_habit` with their notebook pinned', () => {
		const offered = TOOLS.filter((tool) =>
			withinConfinement({ kind: 'notebook', id: mine }, tool)
		).map((tool) => tool.name);
		expect(offered).toContain('recipes');
		expect(offered).toContain('tick_habit');

		for (const name of ['recipes', 'tick_habit']) {
			const tool = TOOLS.find((one) => one.name === name)!;
			const args: Record<string, unknown> = { notebookId: other };
			confine({ kind: 'notebook', id: mine }, tool.refs, tool.input, args);
			expect(args.notebookId, name).toBe(mine);
		}
	});
});
