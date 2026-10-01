import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';
import { baselineArgs, withRef } from './helpers/mcp-baseline';

/**
 * Every tool that names something, pointed at somebody else's row.
 *
 * Seventy of the tools take an id, and each one is a reach into a table. What
 * decides whether the reach lands on the right row is `refs`: the tool says
 * which arguments name a thing and of what kind, and the dispatcher resolves
 * each one among the rows the caller can already list. This is the test that
 * the arrangement holds — not by trusting the declaration, but by making the
 * calls.
 *
 * It is a sweep rather than a list of cases, because a list only covers the
 * tools somebody remembered to add to it. It walks the tool table, seeds one
 * row of every kind under a stranger's account, calls each tool with the
 * stranger's ids in place of its own, and asks two questions that do not
 * depend on guessing each tool's other arguments correctly:
 *
 *   - did anything of the stranger's change?
 *   - did the answer contain anything of the stranger's?
 *
 * A tool that refuses for the wrong reason — a missing argument, a bad date —
 * still passes, and that is fine: it did not touch the row either. What cannot
 * pass is a tool that reads or writes across the fence. Every scope is granted
 * to the caller on purpose, so a refusal is never the fence doing the work:
 * this is about the row, not the grant.
 *
 * `every kind is seeded` below is what stops it from going quietly hollow — a
 * kind added to `KINDS` with nothing seeded for it would make its tools sweep
 * against an id that is nobody's, which passes for the wrong reason.
 *
 * It is cheap: in-process, one SQLite file, no HTTP.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

/** What makes a row recognisably the stranger's if it ever comes back. */
const MARK = 'stranger-only-marker';

/** An id that belongs to nobody, for an argument no kind covers. */
const NOBODYS = 987654;

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let SCOPES: typeof import('../src/lib/server/services/tokens').SCOPES;
let KINDS: typeof import('../src/lib/server/mcp/refs').KINDS;
let assertRefs: typeof import('../src/lib/server/mcp/refs').assertRefs;
let argumentProblem: typeof import('../src/lib/server/mcp/arguments').argumentProblem;

/** One of the stranger's rows for each kind a tool can name. */
const theirs: Record<string, number | string> = {};
/** And one of the caller's own, for each. */
const mine: Record<string, number | string> = {};

/** The tables a confused tool could read from or write to. */
const WATCHED = [
	'todo_tasks',
	'goals',
	'goal_targets',
	'goal_links',
	'goal_areas',
	'habits',
	'habit_occurrences',
	'notebooks',
	'diary_entries',
	'ledgers',
	'bills',
	'bill_payments',
	'ideas',
	'people',
	'activities',
	'reminders',
	'inventory_items',
	'inventory_categories',
	'recipes',
	'recipe_items',
	'locations',
	'workouts',
	'workout_sessions',
	'workout_categories',
	'finance_rules',
	'finance_transactions',
	'exceptional_tasks',
	'recurring_tasks',
	'task_records',
	'media'
];

function snapshot(user = STRANGER): string {
	return JSON.stringify(
		WATCHED.map((table) => [table, database.all(`select * from ${table} where user_id = ?`, user)])
	);
}

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));
	({ KINDS, assertRefs } = await import('../src/lib/server/mcp/refs'));
	({ argumentProblem } = await import('../src/lib/server/mcp/arguments'));

	const at = (user: string) => buildCtx(user, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

	const { createTodo } = await import('../src/lib/services/todos');
	const { createArea, createGoal } = await import('../src/lib/services/goals');
	const { createHabit } = await import('../src/lib/services/habits');
	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createLedger } = await import('../src/lib/services/ledgers');
	const { createEntry } = await import('../src/lib/services/diary');
	const { createIdea } = await import('../src/lib/services/ideas');
	const { createPerson } = await import('../src/lib/services/people');
	const { createActivity, createCategory: createActivityCategory } =
		await import('../src/lib/services/activities');
	const { createFreeReminder } = await import('../src/lib/services/reminders');
	const { createSlot, createExceptional } = await import('../src/lib/services/slots');
	const { recordIdOf } = await import('../src/lib/services/instances');
	const {
		createItem,
		createCategory: createInventoryCategory,
		listItems
	} = await import('../src/lib/services/inventory');
	const { createRecipe, addIngredient } = await import('../src/lib/services/recipes');
	const { createLocation } = await import('../src/lib/services/locations');
	const { createWorkout, createWorkoutCategory, logWorkout } =
		await import('../src/lib/services/workouts');
	const { createRule, recordMovement } = await import('../src/lib/services/statements');
	const { createBill } = await import('../src/lib/services/bills');
	const { ensureTagIds } = await import('../src/lib/services/tags');

	/** One row of every kind a tool can name, under this account. */
	const seedEveryKind = (
		c: ReturnType<typeof at>,
		m: string,
		o: Record<string, number | string>
	) => {
		/** Some services answer with the row, some with its id; both are fine here. */
		const idOf = (made: unknown): number =>
			typeof made === 'number' ? made : (made as { id: number }).id;

		o.todo = idOf(createTodo(c, { title: `todo ${m}` }));
		o.goal = idOf(createGoal(c, { title: `goal ${m}`, horizon: 'week' }));
		o.goalArea = idOf(createArea(c, { name: `area ${m}` }));
		o.habit = idOf(createHabit(c, { name: `habit ${m}` }));
		o.notebook = idOf(createNotebook(c, { title: `notebook ${m}` }));
		o.note = idOf(createEntry(c, { content: `note ${m}` }));
		o.ledger = idOf(createLedger(c, { name: `ledger ${m}` }));
		o.movement = recordMovement(c, {
			ledgerId: o.ledger,
			occurredOn: '2026-03-10',
			amountCents: -1234,
			description: `movement ${m}`
		}).id;
		o.idea = idOf(createIdea(c, { content: `idea ${m}` }));
		o.person = idOf(createPerson(c, { name: `person ${m}` }));
		o.reminder = idOf(createFreeReminder(c, { at: '2026-03-20T09:00', message: `reminder ${m}` }));
		o.location = idOf(createLocation(c, { name: `place ${m}` }));
		o.recipe = idOf(createRecipe(c, { title: `recipe ${m}` }));
		o.sortRule = idOf(createRule(c, { kind: 'tag', name: `rule ${m}`, pattern: m }));
		o.bill = idOf(createBill(c, { name: `bill ${m}`, dueDay: 5 }));

		const activityCategory = idOf(createActivityCategory(c, { name: `cat ${m}` }));
		o.activity = idOf(createActivity(c, { name: `activity ${m}`, categoryId: activityCategory }));
		o.repeatingBlock = idOf(
			createSlot(c, {
				weekday: 1,
				startTime: '09:00',
				durationMinutes: 30,
				mode: 'activity',
				activityId: o.activity
			})
		);
		// A block is one occurrence on a day, and its id says which kind. Its
		// record is made now, so resolving it later writes nothing.
		o.block = `exceptional:${createExceptional(c, {
			date: '2026-03-16',
			startTime: '09:00',
			durationMinutes: 30,
			mode: 'activity',
			activityId: o.activity
		})}`;
		recordIdOf(c, o.block);

		o.inventoryCategory = idOf(createInventoryCategory(c, { name: `section ${m}` }));
		createItem(c, { name: `item ${m}`, type: 'someday' });
		o.item = listItems(c).find((item) => item.name.includes(m))!.id;
		// The same item, as an ingredient of that recipe.
		addIngredient(c, Number(o.recipe), { itemId: o.item });
		o.ingredient = o.item;

		// A label, which is the account's vocabulary and not a room's.
		o.tag = ensureTagIds([`tag-${m}`], c.userId)[0];

		o.workoutCategory = idOf(createWorkoutCategory(c, `group ${m}`));
		o.workout = idOf(createWorkout(c, { title: `exercise ${m}`, categoryId: o.workoutCategory }));
		o.workoutSession = idOf(
			logWorkout(c, Number(o.workout), { doneOn: '2026-03-14', notes: `session ${m}` })
		);
	};

	seedEveryKind(at(STRANGER), MARK, theirs);
	// And the caller's own, for the baselines a substitution starts from.
	seedEveryKind(at(OWNER), 'the-owners-own', mine);

	// A recording is stored from its bytes, which is asynchronous; a webm
	// header is what makes these bytes one.
	const { store } = await import('../src/lib/services/audio');
	const webm = (mark: string) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.from(mark)]);
	theirs.recording = (await store(at(STRANGER), { bytes: webm(MARK) })).id;
	mine.recording = (await store(at(OWNER), { bytes: webm('the-owners-own') })).id;

	// Some listings seed defaults the first time they are read — an account's
	// exercise groups. Read each kind once now, so the snapshots below see
	// only what a call does.
	for (const kind of Object.values(KINDS)) kind.rows(at(OWNER));
});

/**
 * Arguments good enough to get past the shape and reach the id.
 *
 * Deliberately crude everywhere except the ids: a tool that refuses because a
 * string was not a date has still not touched the row, which is the question.
 * The ids are not crude — every argument the tool declared as naming something
 * carries the stranger's row of exactly that kind, which is what makes this a
 * sweep rather than a shape test.
 */
function argsFor(tool: (typeof TOOLS)[number]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const properties = (tool.input?.properties ?? {}) as Record<string, Record<string, unknown>>;
	const declared = new Map((tool.refs ?? []).map((ref) => [ref.arg, ref.kind]));

	for (const [name, schema] of Object.entries(properties)) {
		const kind = declared.get(name);
		if (kind) {
			const id = theirs[kind];
			out[name] = schema.type === 'array' ? [id] : id;
			continue;
		}
		if (Array.isArray(schema.enum)) out[name] = schema.enum[0];
		else if (schema.type === 'number' || schema.type === 'integer') out[name] = 1;
		else if (schema.type === 'boolean') out[name] = false;
		else if (schema.type === 'array') out[name] = [];
		else if (schema.type === 'object') out[name] = {};
		else out[name] = 'x';
	}
	return out;
}

const everyScope = () => Object.keys(SCOPES);

function callAsOwner(tool: string, args: Record<string, unknown>) {
	const caller = {
		ctx: buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }),
		scopes: everyScope()
	};
	return handleBody(caller as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: tool, arguments: args }
	}) as unknown;
}

describe('the seeding this sweep stands on', () => {
	it('covers every kind a tool can name', () => {
		expect(Object.keys(KINDS).filter((kind) => theirs[kind] === undefined)).toEqual([]);
	});
});

describe("somebody else's id", () => {
	/*
	 * One test that walks the table, rather than one test per tool.
	 *
	 * The table is loaded in `beforeAll` — the services behind it want a
	 * database bound first — and a `describe` body runs before that, so there is
	 * nothing to generate cases from at collection time. Walking it inside the
	 * test costs the per-tool name in the report and buys something better: the
	 * failure names every tool that crossed the fence, not the first one.
	 */
	it('is never read and never written, by any tool that takes one', async () => {
		const naming = TOOLS.filter((tool) => (tool.refs ?? []).length);

		// If this collapses, the sweep has quietly stopped sweeping.
		expect(naming.length, 'no tools name anything any more?').toBeGreaterThan(50);

		const changed: string[] = [];
		const disclosed: string[] = [];

		for (const tool of naming) {
			const before = snapshot();

			let answered: string;
			try {
				answered = JSON.stringify(await callAsOwner(tool.name, argsFor(tool)));
			} catch (e) {
				// A throw is a refusal, which is a fine answer. What it must not
				// have done is change anything on the way to refusing.
				answered = String(e);
			}

			if (snapshot() !== before) changed.push(tool.name);
			if (answered.includes(MARK)) disclosed.push(tool.name);
		}

		expect(changed, "these tools wrote to the stranger's rows").toEqual([]);
		expect(disclosed, "these tools answered with the stranger's rows").toEqual([]);
	}, 60_000);

	it('is refused the same way an id that never existed is', async () => {
		// Two different refusals would be a way to ask what exists, one number at
		// a time — so the answer for a foreign row and for no row must match.
		const foreign = JSON.stringify(await callAsOwner('change_task', { id: theirs.todo }));
		const absent = JSON.stringify(await callAsOwner('change_task', { id: NOBODYS }));

		expect(foreign).toEqual(absent);
	});
});

/**
 * The same, from arguments the tool would otherwise accept.
 *
 * The sweep above hands each tool crude arguments and asks only whether the
 * stranger's rows moved — which a tool refusing for a missing argument
 * answers "no" to without ever looking at the id. Here every tool starts from
 * a baseline naming the caller's own row for each reference, checked to get
 * past the schema and those references, and each reference in turn is
 * replaced by the stranger's row and by a number nobody has. Both must be
 * refused by the reference check — not by the schema — identically, and with
 * nothing changed in either account.
 */
describe('one reference at a time, from a valid baseline', () => {
	const ownerCtx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
	const nobodys = (row: number | string) =>
		typeof row === 'string' ? row.replace(/\d+$/, String(NOBODYS)) : NOBODYS;

	it('has a baseline the tool accepts for every tool that names something', () => {
		const invalid: string[] = [];
		for (const tool of TOOLS.filter((t) => (t.refs ?? []).length)) {
			const args = baselineArgs(tool, (kind) => mine[kind]);
			if (!args) {
				invalid.push(`${tool.name}: no row of a kind it names`);
				continue;
			}
			const problem = argumentProblem(tool.input, args);
			if (problem) {
				invalid.push(`${tool.name}: ${JSON.stringify(problem)}`);
				continue;
			}
			try {
				assertRefs(ownerCtx(), tool.refs, args);
			} catch (e) {
				invalid.push(`${tool.name}: ${(e as Error).message}`);
			}
		}
		expect(invalid, 'these baselines would be refused before any reference is swapped').toEqual([]);
	});

	it('refuses a stranger’s row as it refuses no row, by the reference, changing nothing', async () => {
		const leaked: string[] = [];
		const byShape: string[] = [];
		const differed: string[] = [];
		let checked = 0;

		for (const tool of TOOLS) {
			const base = baselineArgs(tool, (kind) => mine[kind]);
			if (!base) continue; // the test above fails on it
			for (const ref of tool.refs ?? []) {
				const before = [snapshot(STRANGER), snapshot(OWNER)].join();
				const foreign = (await callAsOwner(
					tool.name,
					withRef(tool, base, ref.arg, theirs[ref.kind])
				)) as { error?: unknown; result?: { isError?: boolean } };
				const absent = await callAsOwner(
					tool.name,
					withRef(tool, base, ref.arg, nobodys(mine[ref.kind]))
				);
				checked++;
				const at = `${tool.name}.${ref.arg}`;

				if ([snapshot(STRANGER), snapshot(OWNER)].join() !== before) leaked.push(at);
				else if (foreign.error) byShape.push(at);
				else if (!foreign.result?.isError) leaked.push(at);
				else if (JSON.stringify(foreign) !== JSON.stringify(absent)) differed.push(at);
			}
		}

		// Every declared reference, not a sample of them.
		expect(checked).toBe(TOOLS.reduce((n, t) => n + (t.refs ?? []).length, 0));
		expect(leaked, 'these reached a stranger’s row, or changed something').toEqual([]);
		expect(byShape, 'these were refused by the schema, not by the reference').toEqual([]);
		expect(differed, 'these refused a stranger’s row differently from no row').toEqual([]);
	}, 60_000);
});
