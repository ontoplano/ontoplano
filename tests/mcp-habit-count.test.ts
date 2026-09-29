import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

/**
 * A habit's count for a day, set by an assistant.
 *
 * The room's counter sets a day to a number; the tick can only add or take
 * back one. `set_habit_count` is the counter's call over MCP — the number
 * itself, so a repeat changes nothing, and the answer's `before` is the way
 * back.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Answer = {
	error?: { code: number; message?: string };
	result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
};

let call: (name: string, args: Record<string, unknown>, who?: string) => Answer;
let createHabit: typeof import('../src/lib/services/habits').createHabit;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ createHabit } = await import('../src/lib/services/habits'));
	const { handleBody } = await import('../src/lib/server/mcp/protocol');
	const tools = await import('../src/lib/server/mcp/tools');
	call = (name, args, who = OWNER) =>
		handleBody(
			{
				ctx: buildCtx(who, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }),
				scopes: [...tools.ASSISTANT_SCOPES]
			} as never,
			{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
		) as Answer;
});

const answered = (answer: Answer) => {
	expect(answer.error, JSON.stringify(answer.error)).toBeUndefined();
	expect(answer.result?.isError, JSON.stringify(answer.result)).not.toBe(true);
	return answer.result!.structuredContent!;
};

const refused = (answer: Answer) => Boolean(answer.error) || answer.result?.isError === true;

describe('set_habit_count', () => {
	it('sets the day to the number, and says what it replaced', () => {
		const id = createHabit(buildCtx(OWNER, { tz: 'UTC' }), { name: 'drink water' });

		const first = answered(call('set_habit_count', { id, date: '2026-03-14', count: 3 }));
		expect(first.before).toMatchObject({ count: 0 });
		expect(first.after).toMatchObject({ count: 3 });

		// The number itself, so sending it again changes nothing.
		const again = answered(call('set_habit_count', { id, date: '2026-03-14', count: 3 }));
		expect(again.before).toMatchObject({ count: 3 });
		expect(again.after).toMatchObject({ count: 3 });

		// And down, to nothing.
		const cleared = answered(call('set_habit_count', { id, date: '2026-03-14', count: 0 }));
		expect(cleared.after).toMatchObject({ count: 0 });
	});

	it('finds the habit by name, on today when no day is given', () => {
		createHabit(buildCtx(OWNER, { tz: 'UTC' }), { name: 'pages read' });
		const set = answered(call('set_habit_count', { name: 'pages read', count: 2 }));
		expect(set.after).toMatchObject({ count: 2, date: '2026-03-14' });
	});

	it("will not touch somebody else's habit", () => {
		const theirs = createHabit(buildCtx(STRANGER, { tz: 'UTC' }), { name: 'their habit' });
		expect(refused(call('set_habit_count', { id: theirs, count: 1 }))).toBe(true);
	});
});
