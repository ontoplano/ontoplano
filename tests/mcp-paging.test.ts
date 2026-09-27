import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * A capped list says what it capped.
 *
 * `tasks` answered with fifty rows and `count: 50` whether the account held
 * fifty or five hundred, so the newest were invisible and the tool read as a
 * list that had stopped being updated rather than one that was cut short.
 * The answer now carries `total` beside `count`, and `remaining` and
 * `nextOffset` when there is more — and `offset` is how the rest is reached.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;

const HELD = 7;

beforeAll(async () => {
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));

	const { createTodo } = await import('../src/lib/services/todos');
	const ctx = buildCtx(OWNER, { tz: 'UTC' });
	for (let i = 0; i < HELD; i++) createTodo(ctx, { title: `task ${i}`, notes: '' });
});

const ctx = () => buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });

function run(name: string, args: Record<string, unknown> = {}) {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) throw new Error(`no tool called ${name}`);
	return tool.run(ctx(), args) as Record<string, unknown>;
}

describe('a list that was cut short says so', () => {
	it('names the whole size, not the size of the piece', () => {
		const page = run('tasks', { limit: 3 });
		expect(page.count).toBe(3);
		expect(page.total).toBe(HELD);
		expect(page.remaining).toBe(HELD - 3);
		expect(page.nextOffset).toBe(3);
	});

	it('says nothing about more when there is none', () => {
		const page = run('tasks', { limit: 50 });
		expect(page.count).toBe(HELD);
		expect(page.total).toBe(HELD);
		expect(page).not.toHaveProperty('remaining');
		expect(page).not.toHaveProperty('nextOffset');
	});

	it('reaches the rest through the offset it handed out', () => {
		const first = run('tasks', { limit: 3 });
		const second = run('tasks', { limit: 3, offset: first.nextOffset });
		expect(second.offset).toBe(3);
		expect(second.count).toBe(3);
		expect(second.total).toBe(HELD);

		const ids = (rows: unknown) => (rows as { id: number }[]).map((r) => r.id);
		// Disjoint: a page that repeats what the last one said is worse than a cap.
		expect(ids(first.items).some((id) => ids(second.items).includes(id))).toBe(false);

		const last = run('tasks', { limit: 3, offset: second.nextOffset });
		expect(last.count).toBe(HELD - 6);
		expect(last).not.toHaveProperty('nextOffset');
	});

	it('walks off the end without inventing rows', () => {
		const page = run('tasks', { limit: 3, offset: 999 });
		expect(page.count).toBe(0);
		expect(page.total).toBe(HELD);
		expect(page).not.toHaveProperty('nextOffset');
	});

	it('counts what the filter matched, not what the account holds', async () => {
		const { createNotebook } = await import('../src/lib/services/notebooks');
		const { createTodo } = await import('../src/lib/services/todos');
		const id = createNotebook(ctx(), { title: 'one subject' });
		createTodo(ctx(), { title: 'filed', notes: '', notebookId: id });

		const page = run('tasks', { notebookId: id, limit: 50 });
		expect(page.count).toBe(1);
		expect(page.total).toBe(1);
	});
});

describe('every tool that takes an offset answers a page', () => {
	/*
	 * The docs mark these "answers a page" from the manifest, which reads the
	 * `offset` argument — so every tool that has one is held to the answer the
	 * page promises, rather than a list somebody keeps here.
	 */
	it('covers the ones that slice', () => {
		const paging = TOOLS.filter((t) => 'offset' in t.input.properties).map((t) => t.name);
		for (const name of ['tasks', 'up_next', 'diary', 'ideas', 'workout_sessions', 'notebook_notes'])
			expect(paging).toContain(name);
	});

	it('answers with count and total, whichever tool it is', async () => {
		const { createNotebook } = await import('../src/lib/services/notebooks');
		const notebook = createNotebook(ctx(), { title: 'paging' });
		for (const tool of TOOLS.filter((t) => 'offset' in t.input.properties)) {
			// The one argument any of them requires is the thing they list.
			const args = (tool.input.required ?? []).includes('id') ? { id: notebook } : {};
			const page = run(tool.name, args);
			expect(page, tool.name).toHaveProperty('total');
			expect(page, tool.name).toHaveProperty('count');
		}
	});
});
