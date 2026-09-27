/**
 * An id in an answer means a row that is there.
 *
 * It did not once: `add_task` answered `{ id: 559 }` and a minute later
 * nothing by that number existed — so the caller went to label its own work,
 * was told the task was not found, and the work was gone with nothing anywhere
 * saying so. A silent loss is the worst shape a write can fail in, because
 * everything downstream carries on as though it had not.
 *
 * Whatever the cause was, the contract is the fixable part: a tool that
 * declares what it creates has the row read back through the same registry
 * that resolves an id somebody passed in, so `after` carries the thing that
 * was made — and a create that made nothing readable is an error rather than a
 * number.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let ASSISTANT_SCOPES: typeof import('../src/lib/server/mcp/tools').ASSISTANT_SCOPES;

beforeAll(async () => {
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ TOOLS, ASSISTANT_SCOPES } = await import('../src/lib/server/mcp/tools'));
});

const caller = () => ({
	ctx: buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }),
	scopes: [...ASSISTANT_SCOPES, 'destructive']
});

function call(name: string, args: Record<string, unknown>) {
	return handleBody(caller() as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	});
}

/** What a tool call answered, as the object the tool returned. */
function answerOf(result: unknown): Record<string, unknown> {
	const content = (result as { result?: { content?: { text?: string }[] } })?.result?.content ?? [];
	return JSON.parse(content[0]?.text ?? '{}');
}

test('a created todo comes back with the row it made', () => {
	const answer = answerOf(call('add_task', { title: 'ring the plumber' }));

	expect(answer.id, 'a create answers with the id of what it made').toEqual(expect.any(Number));
	// `after` is the row itself rather than null, which is what makes the id
	// checkable at the moment it is handed out.
	expect(answer.after, 'a create used to answer `after: null` and check nothing').toBeTruthy();
	expect((answer.after as { title?: string }).title).toBe('ring the plumber');
});

test('and labelling it straight away finds it', () => {
	// The exact sequence that lost the work: create, then act on the id.
	const made = answerOf(call('add_task', { title: 'measure the wall' }));
	const labelled = answerOf(call('tag_task', { id: made.id, add: 'home' }));

	expect(labelled.tags).toContain('home');
});

/*
 * The declaration is what turns the check on, so a create that does not make
 * it is a create nothing is watching. This is the list as it stands — a tool
 * added to it is a tool that gained the check, which is the direction this is
 * meant to move in.
 */
test('every tool that declares what it creates can read one back', () => {
	const declaring = TOOLS.filter((tool) => tool.creates);

	expect(declaring.map((tool) => tool.name)).toContain('add_task');
	for (const tool of declaring)
		expect(tool.writes, `${tool.name} creates something and is not marked as writing`).toBe(true);
});

/*
 * Every create shows what it made.
 *
 * `add_idea` answered `{ id, before: null, after: null }`, because only
 * `add_task` declared what it creates. Each tool here is called with the least
 * it takes, and has to hand back the row.
 */
test('each create answers with the row it made in `after`', async () => {
	// A block and an activity belong to a category, which the seed does not make.
	const { createCategory } = await import('../src/lib/services/activities');
	createCategory(caller().ctx, { name: 'work' });

	const made = (name: string, args: Record<string, unknown>) => {
		const answer = answerOf(call(name, args));
		expect(answer.after, `${name} answered ${JSON.stringify(answer)}`).toBeTruthy();
		return answer;
	};

	made('write_entry', { content: 'a note' });
	made('add_notebook', { title: 'Kitchen' });
	made('add_idea', { content: 'a bread oven' });
	made('add_inventory_item', { name: 'tiles' });
	made('add_recipe', { title: 'bread' });
	made('add_inventory_category', { name: 'Hardware' });
	made('add_goal', { title: 'rewire', horizon: 'month' });
	made('add_habit', { name: 'stretch' });
	made('add_repeating_block', { weekday: 1, start_time: '09:00', category: 'work' });
	made('add_activity', { name: 'Reading', category: 'work' });
	made('add_person', { name: 'Ana' });
	made('add_location', { name: 'Shed' });
	const workout = made('add_workout', { title: 'Run' });
	made('log_workout', { workout_id: workout.id });
	made('add_workout_category', { name: 'Cardio' });
	made('add_ledger', { name: 'Checking' });
	made('add_sort_rule', { kind: 'tag', name: 'coffee', pattern: 'STARBUCKS' });
	made('add_bill', { name: 'Rent' });
});
