/**
 * `tasks` and `up_next` read through one query.
 *
 * `up_next` is the order the maintainer works in, so its order is pinned here
 * twice: against the comparator in `$lib/ratings` it used to sort with in
 * memory, and as a literal list of a mixed set, so a change to either shows.
 * The rest is what the shared query adds — filters, sorts, SQL paging with a
 * stable tie-break — and that none of it reaches past the account or past a
 * key's notebook.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: unknown };
type Row = Record<string, unknown>;

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let todos: typeof import('../src/lib/services/todos');
let compareByPriority: typeof import('../src/lib/ratings').compareByPriority;

let mine: ReturnType<typeof buildCtx>;
let kitchen = 0;
const made: Record<string, number> = {};

function call(name: string, args: Row = {}, confinement?: { kind: string; id: number }) {
	const message: Rpc = {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return handleBody({ ctx: mine, scopes: ['tasks:read'], confinement } as any, message) as any;
}

const answerOf = (name: string, args: Row = {}, confinement?: { kind: string; id: number }) => {
	const answer = call(name, args, confinement);
	if (answer.result?.isError) throw new Error(JSON.stringify(answer.result.content));
	return answer.result.structuredContent as Row & { items: Row[] };
};
const titles = (name: string, args: Row = {}, confinement?: { kind: string; id: number }) =>
	answerOf(name, args, confinement).items.map((one) => one.title);
const refused = (name: string, args: Row) => {
	const answer = call(name, args);
	return Boolean(answer.result?.isError || answer.error);
};

/** A mixed set: every rating shape, ties, unrated ones, closed and archived ones. */
const SET: [string, Partial<Record<'urgency' | 'ease' | 'interest', number>>, string][] = [
	['unrated a', {}, '2026-03-01T09:00:00Z'],
	['urgent hard', { urgency: 5, ease: 1 }, '2026-03-02T09:00:00Z'],
	['urgent easy', { urgency: 5, ease: 4 }, '2026-03-03T09:00:00Z'],
	['urgent easy wanted', { urgency: 5, ease: 4, interest: 5 }, '2026-03-04T09:00:00Z'],
	['half urgent', { urgency: 3 }, '2026-03-05T09:00:00Z'],
	['postponed', { urgency: 1 }, '2026-03-06T09:00:00Z'],
	['zero', { urgency: 0, ease: 5, interest: 5 }, '2026-03-07T09:00:00Z'],
	['unrated b', {}, '2026-03-01T09:00:00Z'],
	['easy only', { ease: 5 }, '2026-03-08T09:00:00Z'],
	['drain', { ease: 0 }, '2026-03-09T09:00:00Z'],
	['wanted only', { interest: 4 }, '2026-03-10T09:00:00Z'],
	['middle exact', { urgency: 2, ease: 3 }, '2026-03-11T09:00:00Z']
];

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ compareByPriority } = await import('../src/lib/ratings'));
	todos = await import('../src/lib/services/todos');
	const notebooks = await import('../src/lib/services/notebooks');

	mine = buildCtx(OWNER, { tz: 'UTC' });
	const at = (iso: string) => buildCtx(OWNER, { tz: 'UTC', now: new Date(iso) });
	kitchen = notebooks.createNotebook(mine, { title: 'Kitchen' });

	for (const [title, ratings, when] of SET)
		made[title] = todos.createTodo(at(when), {
			title,
			notes: '',
			ratings: { urgency: null, ease: null, interest: null, ...ratings }
		});

	// Not open, or put away: `up_next` must never offer these.
	made.finished = todos.createTodo(at('2026-03-12T09:00:00Z'), {
		title: 'finished',
		notes: '',
		ratings: { urgency: 5, ease: 5, interest: 5 }
	});
	todos.setTodoStatus(at('2026-03-20T09:00:00Z'), made.finished, 'done');
	made.shelved = todos.createTodo(at('2026-03-12T10:00:00Z'), {
		title: 'shelved',
		notes: '',
		ratings: { urgency: 5, ease: 5, interest: 5 }
	});
	todos.archiveTodo(mine, made.shelved);

	// A dated one, filed, labelled, with words to find.
	made.dated = todos.createTodo(at('2026-03-13T09:00:00Z'), {
		title: 'fix the tap',
		notes: 'washer 100% worn_out',
		scheduledDate: '2026-04-02',
		notebookId: kitchen,
		tags: 'plumbing'
	});

	// Somebody else's, rated to win every question it could be asked.
	todos.createTodo(buildCtx(STRANGER, { tz: 'UTC' }), {
		title: 'somebody else’s secret',
		notes: 'fix the tap',
		ratings: { urgency: 5, ease: 5, interest: 5 }
	});
});

describe('up_next keeps its order', () => {
	it('is the comparator’s order, exactly', () => {
		const expected = todos
			.listTodos(mine)
			.filter((one) => !one.archivedAt && one.status !== 'done' && one.status !== 'skipped')
			.sort(compareByPriority)
			.map((one) => one.title);
		expect(titles('up_next', { limit: 20 })).toEqual(expected);
	});

	it('orders a mixed set as it always has', () => {
		expect(titles('up_next', { limit: 20 })).toEqual([
			'urgent easy wanted',
			'urgent easy',
			'urgent hard',
			'half urgent',
			'easy only',
			'wanted only',
			'unrated a',
			'unrated b',
			'fix the tap',
			'drain',
			'middle exact',
			'postponed',
			'zero'
		]);
	});

	it('is `tasks` sorted by priority with the open, unarchived preset', () => {
		expect(titles('tasks', { sort: 'priority', status: 'open', limit: 50 })).toEqual(
			titles('up_next', { limit: 20 })
		);
	});

	it('pages with the offset it hands out', () => {
		const whole = titles('up_next', { limit: 20 });
		const first = answerOf('up_next', { limit: 5 });
		const second = answerOf('up_next', { limit: 5, offset: first.nextOffset });
		const third = answerOf('up_next', { limit: 5, offset: second.nextOffset });
		expect(first.total).toBe(whole.length);
		expect([...first.items, ...second.items, ...third.items].map((one) => one.title)).toEqual(
			whole
		);
		expect(third).not.toHaveProperty('nextOffset');
	});
});

describe('tasks keeps its default', () => {
	it('still includes dated tasks and leaves archived ones out', () => {
		const all = titles('tasks');
		expect(all).toContain('fix the tap');
		expect(all).not.toContain('shelved');
		expect(all).toEqual(
			todos
				.listTodos(mine)
				.filter((one) => !one.archivedAt)
				.map((one) => one.title)
		);
	});

	it('says undated or dated when asked', () => {
		expect(titles('tasks', { scheduled: 'undated' })).not.toContain('fix the tap');
		expect(titles('tasks', { scheduled: 'dated' })).toEqual(['fix the tap']);
	});

	it('selects archived ones three ways, the old spelling included', () => {
		expect(titles('tasks', { archived: 'only' })).toEqual(['shelved']);
		expect(titles('tasks', { archived: 'include' })).toContain('shelved');
		expect(titles('tasks', { includeArchived: true })).toContain('shelved');
		expect(refused('tasks', { includeArchived: true, archived: 'only' })).toBe(true);
	});
});

describe('filters', () => {
	it('ids, and nothing of a stranger’s by id', () => {
		expect(titles('tasks', { ids: [made.zero, made['drain']] }).sort()).toEqual(['drain', 'zero']);
		// A foreign or unknown id is refused before the query, like any other id.
		expect(refused('tasks', { ids: [made.zero, 999999] })).toBe(true);
	});

	it('query matches title and notes literally', () => {
		expect(titles('tasks', { query: 'TAP' })).toEqual(['fix the tap']);
		expect(titles('tasks', { query: '100%' })).toEqual(['fix the tap']);
		expect(titles('tasks', { query: 'worn_out' })).toEqual(['fix the tap']);
		// `%` and `_` are not wildcards.
		expect(titles('tasks', { query: 'w_rn' })).toEqual([]);
		expect(titles('tasks', { query: '%' })).toEqual(['fix the tap']);
	});

	it('dates', () => {
		expect(titles('tasks', { scheduledFrom: '2026-04-01', scheduledTo: '2026-04-30' })).toEqual([
			'fix the tap'
		]);
		expect(titles('tasks', { scheduledTo: '2026-04-01' })).toEqual([]);
		expect(titles('tasks', { createdSince: '2026-03-11', status: 'open' })).toEqual([
			'middle exact',
			'fix the tap'
		]);
		expect(titles('tasks', { completedSince: '2026-03-20' })).toEqual(['finished']);
		expect(refused('tasks', { scheduledFrom: 'April' })).toBe(true);
	});

	it('ratings, an unset one counting as the middle', () => {
		expect(titles('up_next', { minUrgency: 5, limit: 20 })).toEqual([
			'urgent easy wanted',
			'urgent easy',
			'urgent hard'
		]);
		expect(titles('up_next', { maxUrgency: 1, limit: 20 })).toEqual(['postponed', 'zero']);
		// 2.5 is inside [2, 3]; the unrated ones are there.
		expect(titles('up_next', { minUrgency: 2, maxUrgency: 3, limit: 20 })).toContain('unrated a');
		expect(refused('up_next', { minEase: 9 })).toBe(true);
	});

	it('tags, and taggedSince in the query', () => {
		expect(titles('up_next', { tags: ['plumbing'] })).toEqual(['fix the tap']);
		expect(titles('tasks', { taggedSince: '2026-01-01' })).toEqual(['fix the tap']);
		expect(titles('tasks', { tags: ['other'], taggedSince: '2026-01-01' })).toEqual([]);
	});

	it('notebook 0 is the unfiled ones, for both tools', () => {
		expect(titles('tasks', { notebookId: 0 })).not.toContain('fix the tap');
		expect(titles('up_next', { notebookId: 0, limit: 20 })).not.toContain('fix the tap');
		expect(titles('up_next', { notebookId: kitchen, limit: 20 })).toEqual(['fix the tap']);
	});

	it('refuses a sort or state it does not know', () => {
		expect(refused('tasks', { sort: 'user_id' })).toBe(true);
		expect(refused('tasks', { direction: 'sideways' })).toBe(true);
		expect(refused('tasks', { status: 'maybe' })).toBe(true);
		expect(refused('tasks', { scheduled: 'sometimes' })).toBe(true);
	});
});

describe('sorting and paging', () => {
	it('breaks ties by id, so pages neither repeat nor skip', () => {
		// Two unrated tasks written the same second: only the id tells them apart.
		const a = titles('tasks', { sort: 'created', direction: 'asc', limit: 2 });
		expect(a).toEqual(['unrated a', 'unrated b']);

		const whole = titles('tasks', { sort: 'title', archived: 'include', limit: 200 });
		const walked: unknown[] = [];
		let offset: unknown = 0;
		while (offset !== undefined) {
			const page = answerOf('tasks', { sort: 'title', archived: 'include', limit: 3, offset });
			walked.push(...page.items.map((one) => one.title));
			offset = page.nextOffset;
		}
		expect(walked).toEqual(whole);
		expect(new Set(walked).size).toBe(walked.length);
	});

	it('runs each order both ways, with no date last', () => {
		const title = titles('tasks', { sort: 'title' });
		expect(titles('tasks', { sort: 'title', direction: 'desc' })).toEqual(
			[...title].sort((x, y) => String(y).localeCompare(String(x)))
		);
		expect(titles('tasks', { sort: 'scheduled' })[0]).toBe('fix the tap');
		expect(titles('tasks', { sort: 'scheduled', direction: 'desc' })[0]).toBe('fix the tap');
		expect(titles('tasks', { sort: 'completed', archived: 'include', limit: 1 })).toEqual([
			'finished'
		]);
	});

	it('bounds the page in the query, whatever limit is asked', () => {
		const { items, total } = todos.queryTodos(mine, { limit: 1e9, archived: 'include' });
		expect(items.length).toBe(total);
		expect(todos.queryTodos(mine, { limit: 2, offset: 1, archived: 'include' }).items.length).toBe(
			2
		);
		expect(() =>
			todos.queryTodos(mine, { limit: 10, ids: Array.from({ length: 201 }, (_, i) => i) })
		).toThrow();
	});
});

describe('ownership and confinement', () => {
	it('a stranger’s task never answers, however it is asked', () => {
		for (const args of [{ sort: 'priority' }, { archived: 'include' }])
			expect(titles('tasks', args)).not.toContain('somebody else’s secret');
		for (const args of [
			{},
			{ query: 'fix the tap' },
			{ minUrgency: 5 },
			{ scheduled: 'undated' }
		]) {
			expect(titles('tasks', args)).not.toContain('somebody else’s secret');
			expect(titles('up_next', { ...args, limit: 20 })).not.toContain('somebody else’s secret');
		}
	});

	it('a key tied to one notebook reads only that notebook', () => {
		const confined = { kind: 'notebook', id: kitchen };
		expect(titles('tasks', { notebookId: 0 }, confined)).toEqual(['fix the tap']);
		expect(titles('up_next', { limit: 20 }, confined)).toEqual(['fix the tap']);
		// Naming a task outside it by id is refused, not answered.
		expect(call('tasks', { ids: [made.zero] }, confined).result?.isError).toBe(true);
	});
});
