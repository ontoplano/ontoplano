/**
 * Asking for part of a list, and getting no more than was asked for.
 *
 * These filters exist to save tokens, and a filter that saves tokens by
 * widening what a key can see would be a poor trade. So two things are pinned
 * here and they are not the same thing: that the narrowing works, and that
 * nothing about it reaches past the caller's own account or past a key's
 * confinement — the case worth testing, because it is the one somebody tries.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: unknown };

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let todos: typeof import('../src/lib/services/todos');
let notebooks: typeof import('../src/lib/services/notebooks');
let diary: typeof import('../src/lib/services/diary');

let mine: ReturnType<typeof buildCtx>;
let theirs: ReturnType<typeof buildCtx>;
let kitchen = 0;
let trip = 0;
let queue = 0;
/** Ids, so a filtered answer can be checked against the task it should be. */
const made: Record<string, number> = {};

function call(
	scopes: string[],
	name: string,
	args: Record<string, unknown> = {},
	confinement?: { kind: string; id: number }
) {
	const message: Rpc = {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return handleBody({ ctx: mine, scopes, confinement } as any, message) as any;
}

const itemsOf = (answer: { result: { structuredContent: { items?: unknown[] } } }) =>
	(answer.result.structuredContent.items ?? []) as Record<string, unknown>[];

/** What a listing said about the spelling it was asked in, if anything. */
const warningOf = (answer: { result: { structuredContent: { warning?: string } } }) =>
	answer.result.structuredContent.warning;

const titlesOf = (answer: { result: { structuredContent: { items?: unknown[] } } }) =>
	itemsOf(answer)
		.map((one) => one.title as string)
		.sort();

/** The names a caller is actually offered — what a confined key can see at all. */
function listedTools(scopes: string[], confinement?: { kind: string; id: number }): string[] {
	const message: Rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const answer = handleBody({ ctx: mine, scopes, confinement } as any, message) as any;
	return answer.result.tools.map((one: { name: string }) => one.name);
}

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	todos = await import('../src/lib/services/todos');
	notebooks = await import('../src/lib/services/notebooks');
	diary = await import('../src/lib/services/diary');

	mine = buildCtx(OWNER, { tz: 'UTC' });
	theirs = buildCtx(STRANGER, { tz: 'UTC' });

	kitchen = notebooks.createNotebook(mine, { title: 'Kitchen' });
	trip = notebooks.createNotebook(mine, { title: 'Trip' });
	queue = notebooks.createNotebook(mine, { title: 'Queue' });

	made.plumber = todos.createTodo(mine, {
		title: 'ring the plumber',
		notes: 'the boiler makes a noise',
		notebookId: kitchen,
		tags: 'done-by-ai',
		ratings: { urgency: 5, interest: 1, ease: 4 }
	});
	made.skip = todos.createTodo(mine, {
		title: 'book the skip',
		notebookId: kitchen,
		ratings: { urgency: 5, interest: 3, ease: 2 }
	});
	made.tiles = todos.createTodo(mine, {
		title: 'choose the tiles',
		notebookId: kitchen,
		ratings: { urgency: 2 }
	});
	made.pack = todos.createTodo(mine, { title: 'pack', notebookId: trip });
	made.finished = todos.createTodo(mine, { title: 'buy stamps', notebookId: kitchen });
	todos.setTodoStatus(mine, made.finished, 'done');

	// A queue split across three labels — the case `tags` exists for, where
	// reading it used to be three calls and a merge done by the caller.
	made.urgent = todos.createTodo(mine, {
		title: 'file the tax return',
		notebookId: queue,
		tags: 'u5'
	});
	made.easy = todos.createTodo(mine, {
		title: 'water the plants',
		notebookId: queue,
		tags: 'e2'
	});
	made.wanted = todos.createTodo(mine, {
		title: 'read the manual',
		notebookId: queue,
		tags: 'i5'
	});
	made.unlabelled = todos.createTodo(mine, { title: 'sort the shed', notebookId: queue });

	// The stranger's own list, which must never appear in any answer here.
	todos.createTodo(theirs, { title: 'somebody else’s secret', tags: 'done-by-ai' });

	diary.createEntry(mine, {
		content: 'Quotes from three plumbers.',
		title: 'Quotes',
		notebookId: kitchen,
		tags: 'ai-review'
	});
	diary.createEntry(mine, {
		content: 'Tiles arrive Tuesday.',
		title: 'Tiles',
		notebookId: kitchen
	});
});

describe('narrowing a task list', () => {
	test('by state, with `open` meaning not finished and not skipped', () => {
		const open = itemsOf(call(['tasks:read'], 'tasks', { status: 'open', notebookId: kitchen }));
		const titles = open.map((one) => one.title);
		expect(titles).toContain('ring the plumber');
		expect(titles).not.toContain('buy stamps');

		const done = itemsOf(call(['tasks:read'], 'tasks', { status: 'done', notebookId: kitchen }));
		expect(done.map((one) => one.title)).toEqual(['buy stamps']);
	});

	test('by a label, and by the absence of one', () => {
		const marked = itemsOf(call(['tasks:read'], 'tasks', { tag: 'done-by-ai' }));
		expect(marked.map((one) => one.title)).toEqual(['ring the plumber']);

		const rest = itemsOf(
			call(['tasks:read'], 'tasks', { withoutTag: 'done-by-ai', notebookId: kitchen })
		);
		expect(rest.map((one) => one.title)).not.toContain('ring the plumber');
		expect(rest.map((one) => one.title)).toContain('book the skip');
	});

	test('by any of several labels, sent as a list or as one string', () => {
		expect(
			titlesOf(call(['tasks:read'], 'tasks', { tags: ['u5', 'i5'], notebookId: queue }))
		).toEqual(['file the tax return', 'read the manual']);

		// Assistants send both shapes, so both have to mean the same thing.
		expect(titlesOf(call(['tasks:read'], 'tasks', { tags: 'u5, i5', notebookId: queue }))).toEqual([
			'file the tax return',
			'read the manual'
		]);
	});

	test('`withoutTags` drops anything carrying any one of them', () => {
		expect(
			titlesOf(call(['tasks:read'], 'tasks', { withoutTags: ['u5', 'e2'], notebookId: queue }))
		).toEqual(['read the manual', 'sort the shed']);
	});

	test('`tagMode: "all"` keeps only what carries every label named', () => {
		const both = todos.createTodo(mine, {
			title: 'urgent and easy',
			notebookId: queue,
			tags: 'u5 e2'
		});
		try {
			expect(
				titlesOf(
					call(['tasks:read'], 'tasks', { tags: ['u5', 'e2'], tagMode: 'all', notebookId: queue })
				)
			).toEqual(['urgent and easy']);
			expect(
				titlesOf(call(['tasks:read'], 'up_next', { tags: ['u5', 'e2'], tagMode: 'all', limit: 5 }))
			).toEqual(['urgent and easy']);
			// A mode it does not know is a sentence, not a filter quietly read as `any`.
			expect(
				JSON.stringify(
					call(['tasks:read'], 'tasks', { tags: ['u5'], tagMode: 'some', notebookId: queue })
				)
			).toMatch(/tagMode has to be/);
		} finally {
			todos.deleteTodo(mine, both);
		}
	});

	test('the single-label spelling still works, and the answer says it is going', () => {
		const old = call(['tasks:read'], 'tasks', { tag: 'u5', notebookId: queue });
		expect(titlesOf(old)).toEqual(['file the tax return']);
		expect(warningOf(old)).toMatch(/`tag` is deprecated/);
		expect(warningOf(old)).toContain('0.185.0');

		const mirror = call(['tasks:read'], 'tasks', { withoutTag: 'u5', notebookId: queue });
		expect(titlesOf(mirror)).not.toContain('file the tax return');
		expect(warningOf(mirror)).toMatch(/`withoutTag` is deprecated/);

		// The spelling that replaced it is not nagged at.
		expect(
			warningOf(call(['tasks:read'], 'tasks', { tags: ['u5'], notebookId: queue }))
		).toBeUndefined();
	});

	test('by when a label went on', () => {
		// Tagged a moment ago, so "since yesterday" keeps it and "since
		// tomorrow" does not. The date read is the label's own.
		const day = (shift: number) =>
			new Date(Date.parse('2026-09-21T00:00:00Z') + shift * 86_400_000).toISOString().slice(0, 10);

		const recent = itemsOf(
			call(['tasks:read'], 'tasks', { tag: 'done-by-ai', taggedSince: day(-400) })
		);
		expect(recent.map((one) => one.title)).toEqual(['ring the plumber']);

		const later = itemsOf(
			call(['tasks:read'], 'tasks', { tag: 'done-by-ai', taggedSince: day(400) })
		);
		expect(later).toEqual([]);
	});

	test('a malformed moment is a sentence, not a filter that matches everything', () => {
		const answer = call(['tasks:read'], 'tasks', { taggedSince: 'yesterdayish' });
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toMatch(/ISO|date/i);
	});
});

describe('how much of a row comes back', () => {
	test('a line by default: what it is, not what is written on it', () => {
		const [one] = itemsOf(call(['tasks:read'], 'tasks', { tag: 'done-by-ai' }));
		expect(one.title).toBe('ring the plumber');
		expect(one.status).toBe('todo');
		expect(one.seq).toBe(1);
		expect(one.tags).toEqual(['done-by-ai']);
		// The expensive part is left out until it is asked for.
		expect(one.notes).toBeUndefined();
	});

	test('a line says what the task is about, and names its pictures', () => {
		// A title is not always the task: half a working list is a line of
		// title and a paragraph of what actually happened, with the screenshot
		// that prompted it. Without these a list is unreadable without a
		// second call per row.
		const withShot = todos.createTodo(mine, {
			title: 'ugly as fuck',
			notes: 'look at this ![shot](/media/39) — the goals header is primitive',
			notebookId: trip
		});
		const [one] = itemsOf(call(['tasks:read'], 'tasks', { notebookId: trip })).filter(
			(row) => row.id === withShot
		);
		expect(one.opening).toContain('the goals header is primitive');
		expect(one.media).toEqual(['/media/39']);
		// Still a line: the whole paragraph is behind `verbose`.
		expect(one.notes).toBeUndefined();
	});

	test('`verbose` is the whole row', () => {
		const [one] = itemsOf(call(['tasks:read'], 'tasks', { tag: 'done-by-ai', verbose: true }));
		expect(one.notes).toBe('the boiler makes a noise');
		expect(one.notebook).toBe('Kitchen');
	});

	test('`fields` is exactly what was named, and always the id', () => {
		const [one] = itemsOf(
			call(['tasks:read'], 'tasks', { tag: 'done-by-ai', fields: 'title,notes' })
		);
		expect(Object.keys(one).sort()).toEqual(['id', 'notes', 'title']);
	});

	test('a field that does not exist is refused by name', () => {
		const answer = call(['tasks:read'], 'tasks', { fields: 'title,password' });
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toContain('password');
	});

	/*
	 * The one that matters. `fields` names keys of a shape this file builds —
	 * it never reaches a query, and a name that is not in that shape is
	 * refused rather than passed on. These are the spellings somebody tries.
	 */
	test('a field name cannot reach past the shape it names', () => {
		for (const attempt of [
			'__proto__',
			'constructor',
			'title; drop table todo_tasks',
			"title' or 1=1 --",
			'../../etc/passwd',
			'userId',
			'user_id'
		]) {
			const answer = call(['tasks:read'], 'tasks', { fields: attempt });
			expect(answer.result.isError, `${attempt} was not refused`).toBe(true);
		}
	});

	test('a label filter is a word, not a pattern', () => {
		// No globbing, no regex: a label either is the word or is not.
		for (const attempt of ['done%', 'done-by-%', '.*', 'done-by-ai; drop table tags']) {
			expect(itemsOf(call(['tasks:read'], 'tasks', { tag: attempt }))).toEqual([]);
		}
	});
});

describe('`fields` offers what the shape can carry', () => {
	/** Every tool that takes `fields`, with what it needs to answer at all. */
	const needs: Record<string, () => Record<string, unknown>> = {
		notebook_notes: () => ({ id: kitchen })
	};

	test('every key a verbose row carries is a field that can be asked for', async () => {
		const { TOOLS } = await import('../src/lib/server/mcp/tools');
		const takingFields = TOOLS.filter(
			(tool) => 'fields' in ((tool.input as { properties?: object }).properties ?? {})
		);
		expect(takingFields.map((tool) => tool.name).sort()).toEqual(
			['diary', 'notebook_notes', 'tasks', 'up_next'].sort()
		);

		diary.createEntry(mine, { content: 'A quiet day.', title: 'Sunday', tags: 'rest' });
		for (const tool of takingFields) {
			const base = needs[tool.name]?.() ?? {};
			const rows = itemsOf(call([tool.scope], tool.name, { ...base, verbose: true, limit: 20 }));
			const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
			expect(keys.length, `${tool.name} answered nothing to check`).toBeGreaterThan(1);
			const answer = call([tool.scope], tool.name, { ...base, fields: keys.join(','), limit: 20 });
			expect(answer.result.isError, `${tool.name}: ${answer.result.content?.[0]?.text}`).not.toBe(
				true
			);
		}
	});

	test('`tags` can be asked of a list whose rows carry none', () => {
		// The shape has labels whether or not this row does; refusing the word
		// because the first task happened to be unlabelled was the bug.
		for (const name of ['tasks', 'up_next']) {
			const answer = call(['tasks:read'], name, {
				notebookId: trip,
				fields: 'title,tags,taggedAt,ratings,opening,media'
			});
			expect(answer.result.isError, `${name}: ${answer.result.content?.[0]?.text}`).not.toBe(true);
			const [one] = itemsOf(answer);
			expect(one.title).toBe('pack');
		}

		const [labelled] = itemsOf(
			call(['tasks:read'], 'up_next', { tags: 'done-by-ai', fields: 'title,tags' })
		);
		expect(labelled).toEqual({ id: made.plumber, title: 'ring the plumber', tags: ['done-by-ai'] });
	});
});

describe('what to do next', () => {
	test('is the most urgent, ties broken by the lighter one then by interest', () => {
		const [first] = itemsOf(call(['tasks:read'], 'up_next', { notebookId: kitchen }));
		// Two at urgency 5; the plumber is the easier of the two.
		expect(first.title).toBe('ring the plumber');
	});

	test('takes a few to choose between, and leaves the finished out', () => {
		const rows = itemsOf(call(['tasks:read'], 'up_next', { limit: 5, notebookId: kitchen }));
		expect(rows.map((one) => one.title)).toEqual([
			'ring the plumber',
			'book the skip',
			'choose the tiles'
		]);
	});

	test('can be asked of several queues at once', () => {
		const rows = call(['tasks:read'], 'up_next', {
			limit: 5,
			tags: ['u5', 'i5'],
			notebookId: queue
		});
		expect(titlesOf(rows)).toEqual(['file the tax return', 'read the manual']);
	});

	test('answers with one line, so asking costs almost nothing', () => {
		const [one] = itemsOf(call(['tasks:read'], 'up_next', {}));
		expect(one.notes).toBeUndefined();
		expect(Object.keys(one)).toContain('title');
	});
});

describe('the same reach for notes', () => {
	test('a notebook can be read for what is in review', () => {
		const rows = itemsOf(call(['notes:read'], 'notebook_notes', { id: kitchen, tag: 'ai-review' }));
		expect(rows).toHaveLength(1);
		expect(rows[0].title).toBe('Quotes');
	});

	test('a line names the pictures it refers to, rather than carrying them', () => {
		// A note is usually read to find something, and its pictures are the
		// expensive part. The links are enough to fetch one with `media` if it
		// turns out to matter.
		diary.createEntry(mine, {
			content: 'Look at this ![tap](/media/12) and hear ![said](/media/audio/9).',
			title: 'The tap',
			notebookId: kitchen
		});
		const rows = itemsOf(call(['notes:read'], 'notebook_notes', { id: kitchen }));
		const one = rows.find((row) => row.title === 'The tap');
		expect(one?.media).toEqual(['/media/12', '/media/audio/9']);
	});

	test('a line carries an opening rather than the writing', () => {
		const [one] = itemsOf(
			call(['notes:read'], 'notebook_notes', { id: kitchen, tag: 'ai-review' })
		);
		expect(one.opening).toContain('Quotes from three plumbers');
		expect(one.content).toBeUndefined();

		const [whole] = itemsOf(
			call(['notes:read'], 'notebook_notes', { id: kitchen, tag: 'ai-review', verbose: true })
		);
		expect(whole.content).toBe('Quotes from three plumbers.');
	});
});

describe('none of it widens what a key can see', () => {
	test('a stranger’s task never appears, however the list is narrowed', () => {
		for (const args of [
			{ tag: 'done-by-ai' },
			{ status: 'open' },
			{ verbose: true },
			{ fields: 'title' },
			{ withoutTag: 'nothing' },
			{ limit: 500 }
		]) {
			const titles = itemsOf(call(['tasks:read'], 'tasks', args)).map((one) => one.title);
			expect(titles).not.toContain('somebody else’s secret');
		}
	});

	test('a key tied to one notebook stays tied to it through every filter', () => {
		const confined = { kind: 'notebook', id: kitchen };
		for (const args of [{}, { status: 'open' }, { verbose: true }, { tag: 'done-by-ai' }]) {
			const rows = itemsOf(call(['tasks:read'], 'tasks', args, confined));
			expect(rows.map((one) => one.title)).not.toContain('pack');
		}

		// And `up_next` is not a way round it.
		const next = itemsOf(call(['tasks:read'], 'up_next', { limit: 20 }, confined));
		expect(next.map((one) => one.title)).not.toContain('pack');
	});

	test('can ask which notebook it is tied to, and is told only that one', () => {
		/*
		 * The tool took no arguments, so it named no notebook and a confined key
		 * was never offered it — the one assistant that can only work on a single
		 * subject was the one that could not find out which subject, or the id
		 * every other tool asks it for.
		 */
		const confined = { kind: 'notebook', id: kitchen };
		const offered = listedTools(['notes:read'], confined);
		expect(offered).toContain('notebooks');

		const answer = call(['notes:read'], 'notebooks', {}, confined);
		const said = answer.result.structuredContent as { items?: { id: number; title: string }[] };
		const rows = said.items ?? (answer.result.structuredContent as { id: number; title: string }[]);
		const list = Array.isArray(rows) ? rows : [rows];
		expect(list.map((one) => one.id)).toEqual([kitchen]);
		expect(list.map((one) => one.title)).toEqual(['Kitchen']);
	});

	test('asking for another notebook by id is answered about the confined one', () => {
		const rows = itemsOf(
			call(['tasks:read'], 'tasks', { notebookId: trip }, { kind: 'notebook', id: kitchen })
		);
		expect(rows.map((one) => one.title)).not.toContain('pack');
	});
});

describe('marking a task says only what changed', () => {
	test('the labels it has now, and not two copies of the task', () => {
		const answer = call(['tasks:write'], 'tag_task', { id: made.tiles, add: 'done-by-ai' });
		const said = answer.result.structuredContent;
		expect(said.tags).toEqual(['done-by-ai']);
		expect(said.id).toBe(made.tiles);
		expect(said.before).toBeUndefined();
		expect(said.after).toBeUndefined();
		// Nothing of the task's own writing rides along.
		expect(JSON.stringify(said)).not.toContain('choose the tiles');
	});
});
