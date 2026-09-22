/**
 * An assistant written against `energy` still works, and means the same thing.
 *
 * `energy` asked how much a task would take out of somebody, so five was the
 * worst answer; `ease` asks the opposite on the same scale, so five is the
 * best. The values already in the database were mirrored by a migration — and
 * the callers were not, because they are other people's assistants, running
 * somewhere else, written against the shape this server published.
 *
 * So the old argument stays for a release and is translated rather than
 * refused: an `energy` of 5 is an `ease` of 1. Refusing it would have been
 * honest; silently storing 5 as 5 would not, and that is the failure this
 * pins down — a task an assistant called draining coming back as the easiest
 * thing on the list.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let todos: typeof import('../src/lib/services/todos');
let ctx: ReturnType<typeof buildCtx>;

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	todos = await import('../src/lib/services/todos');
	ctx = buildCtx(OWNER, { tz: 'UTC' });
});

function call(tool: string, args: Record<string, unknown>) {
	const answer = handleBody({ ctx, scopes: ['tasks:read', 'tasks:write'] } as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: tool, arguments: args }
	}) as { result?: { isError?: boolean; structuredContent?: { id?: number } }; error?: unknown };
	expect(answer.error, JSON.stringify(answer)).toBeUndefined();
	expect(answer.result?.isError, JSON.stringify(answer.result)).toBeFalsy();
	return answer.result?.structuredContent;
}

const easeOf = (id: number) => todos.listTodos(ctx).find((t) => t.id === id)!.ratings.ease;

/** A task with nothing rated on it, ready to be told something. */
const fresh = (title: string) => todos.createTodo(ctx, { title });

describe('a caller still sending `energy`', () => {
	test('has it stored as the ease it means, not as the number it typed', () => {
		// Draining, on the old scale. The hardest thing on the list.
		const id = fresh('strip the wallpaper');
		call('change_todo', { id, energy: 5 });
		expect(easeOf(id)).toBe(1);
	});

	test('at every point on the scale, mirrored about the middle', () => {
		for (const [energy, ease] of [
			[1, 5],
			[2, 4],
			[3, 3],
			[4, 2],
			[5, 1]
		]) {
			const id = fresh(`energy ${energy}`);
			call('change_todo', { id, energy });
			expect(easeOf(id), `energy ${energy}`).toBe(ease);
		}
	});

	test('and `ease` wins where a caller sends both, being the one that is current', () => {
		const id = fresh('both');
		call('change_todo', { id, energy: 5, ease: 4 });
		expect(easeOf(id)).toBe(4);
	});

	test('is told so in the answer, with the release that removes it', () => {
		const id = fresh('warned');
		const said = call('change_todo', { id, energy: 2 }) as { warning?: string };
		expect(said.warning).toMatch(/`energy` is deprecated/);
		expect(said.warning).toContain('0.190');
		// And the replacement is named, not merely the removal.
		expect(said.warning).toContain('`ease`');
	});

	test('and a caller using `ease` is not warned about anything', () => {
		const id = fresh('unwarned');
		const said = call('change_todo', { id, ease: 2 }) as { warning?: string };
		expect(said.warning).toBeUndefined();
	});

	test('while an edit that mentions neither leaves the rating alone', () => {
		const id = todos.createTodo(ctx, { title: 'sand the floor', ratings: { ease: 5 } });
		call('change_todo', { id, title: 'sand the floor properly' });
		expect(easeOf(id)).toBe(5);
	});
});
