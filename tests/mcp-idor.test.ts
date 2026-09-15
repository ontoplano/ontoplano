import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, STRANGER, makeDatabase, seedAccounts } from './helpers/db';

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

/** One of the stranger's rows for each kind a tool can name. */
const theirs: Record<string, number | string> = {};

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
	'shopping_items',
	'shopping_categories',
	'recipes',
	'locations',
	'workouts',
	'workout_sessions',
	'workout_categories',
	'finance_rules',
	'exceptional_tasks',
	'recurring_tasks',
	'task_records'
];

function snapshot(): string {
	return JSON.stringify(
		WATCHED.map((table) => [
			table,
			database.all(`select * from ${table} where user_id = ?`, STRANGER)
		])
	);
}

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));
	({ KINDS } = await import('../src/lib/server/mcp/refs'));

	const them = buildCtx(STRANGER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

	const { createTodo } = await import('../src/lib/services/todos');
	const { createGoal } = await import('../src/lib/services/goals');
	const { createHabit } = await import('../src/lib/services/habits');
	const { createNotebook } = await import('../src/lib/services/notebooks');
	const { createLedger } = await import('../src/lib/services/ledgers');
	const { createEntry } = await import('../src/lib/services/diary');
	const { createIdea } = await import('../src/lib/services/ideas');
	const { createPerson } = await import('../src/lib/services/people');
	const { createActivity, createCategory: createActivityCategory } =
		await import('../src/lib/services/activities');
	const { createFreeReminder } = await import('../src/lib/services/reminders');
	const { createSlot } = await import('../src/lib/services/slots');
	const {
		createItem,
		createCategory: createShoppingCategory,
		listItems
	} = await import('../src/lib/services/shopping');
	const { createRecipe } = await import('../src/lib/services/recipes');
	const { createLocation } = await import('../src/lib/services/locations');
	const { createWorkout, createWorkoutCategory, logWorkout } =
		await import('../src/lib/services/workouts');
	const { createRule } = await import('../src/lib/services/statements');
	const { createBill } = await import('../src/lib/services/bills');

	/** Some services answer with the row, some with its id; both are fine here. */
	const idOf = (made: unknown): number =>
		typeof made === 'number' ? made : (made as { id: number }).id;

	theirs.todo = idOf(createTodo(them, { title: `todo ${MARK}` }));
	theirs.goal = idOf(createGoal(them, { title: `goal ${MARK}`, horizon: 'week' }));
	theirs.habit = idOf(createHabit(them, { name: `habit ${MARK}` }));
	theirs.notebook = idOf(createNotebook(them, { title: `notebook ${MARK}` }));
	theirs.note = idOf(createEntry(them, { content: `note ${MARK}` }));
	theirs.ledger = idOf(createLedger(them, { name: `ledger ${MARK}` }));
	theirs.idea = idOf(createIdea(them, { content: `idea ${MARK}` }));
	theirs.person = idOf(createPerson(them, { name: `person ${MARK}` }));
	theirs.reminder = idOf(
		createFreeReminder(them, { at: '2026-03-20T09:00', message: `reminder ${MARK}` })
	);
	theirs.location = idOf(createLocation(them, { name: `place ${MARK}` }));
	theirs.recipe = idOf(createRecipe(them, { title: `recipe ${MARK}` }));
	theirs.sortRule = idOf(createRule(them, { kind: 'tag', name: `rule ${MARK}`, pattern: MARK }));
	theirs.bill = idOf(createBill(them, { name: `bill ${MARK}`, dueDay: 5 }));

	const activityCategory = idOf(createActivityCategory(them, { name: `cat ${MARK}` }));
	theirs.activity = idOf(
		createActivity(them, { name: `activity ${MARK}`, categoryId: activityCategory })
	);
	theirs.repeatingBlock = idOf(
		createSlot(them, {
			weekday: 1,
			startTime: '09:00',
			durationMinutes: 30,
			mode: 'activity',
			activityId: theirs.activity
		})
	);
	// A block is an occurrence of one of those, and its id says which.
	theirs.block = `slot:${theirs.repeatingBlock}`;

	theirs.shoppingCategory = idOf(createShoppingCategory(them, { name: `section ${MARK}` }));
	createItem(them, { name: `item ${MARK}`, type: 'someday' });
	theirs.item = listItems(them).find((item) => item.name.includes(MARK))!.id;

	theirs.workoutCategory = idOf(createWorkoutCategory(them, `group ${MARK}`));
	theirs.workout = idOf(
		createWorkout(them, { title: `exercise ${MARK}`, categoryId: theirs.workoutCategory })
	);
	theirs.workoutSession = idOf(
		logWorkout(them, Number(theirs.workout), { doneOn: '2026-03-14', notes: `session ${MARK}` })
	);
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
	});

	it('is refused the same way an id that never existed is', async () => {
		// Two different refusals would be a way to ask what exists, one number at
		// a time — so the answer for a foreign row and for no row must match.
		const foreign = JSON.stringify(await callAsOwner('change_todo', { id: theirs.todo }));
		const absent = JSON.stringify(await callAsOwner('change_todo', { id: NOBODYS }));

		expect(foreign).toEqual(absent);
	});
});
