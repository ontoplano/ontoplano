/**
 * Calls an assistant can safely make twice.
 *
 * `ifUpdatedAt` on a change refuses to overwrite a row somebody else moved
 * since it was read; `requestId` on a create answers a retry with the first
 * answer instead of making a second one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Answer = {
	error?: { code: number; data?: Record<string, unknown> };
	result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
};

let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let concurrency: typeof import('../src/lib/server/mcp/concurrency');
let call: (name: string, args: Record<string, unknown>, who?: string) => Answer;
let REQUEST_REPLAY_WINDOW_MS: number;
let clock = Date.parse('2026-03-14T10:00:00Z');

beforeAll(async () => {
	const { buildCtx } = await import('../src/lib/services/ctx');
	const { handleBody } = await import('../src/lib/server/mcp/protocol');
	const tools = await import('../src/lib/server/mcp/tools');
	TOOLS = tools.TOOLS;
	concurrency = await import('../src/lib/server/mcp/concurrency');
	({ REQUEST_REPLAY_WINDOW_MS } = await import('../src/lib/server/services/request-replays'));
	call = (name, args, who = OWNER) => {
		// Each call a second later, so a stamp written by one differs from the next.
		clock += 1000;
		const ctx = buildCtx(who, { tz: 'UTC', now: new Date(clock) });
		return handleBody({ ctx, scopes: [...tools.ASSISTANT_SCOPES] } as never, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: args }
		}) as Answer;
	};
});

const answered = (answer: Answer) => {
	expect(answer.error, JSON.stringify(answer.error)).toBeUndefined();
	expect(answer.result?.isError, JSON.stringify(answer.result)).not.toBe(true);
	return answer.result!.structuredContent!;
};

describe('ifUpdatedAt', () => {
	it('is offered by every change tool whose subject keeps an updated_at, and by no other', () => {
		for (const tool of TOOLS) {
			const offers = 'ifUpdatedAt' in tool.input.properties;
			const stamped = concurrency.stampedRef(tool.refs) !== undefined;
			const changes = /^(change|edit)_/.test(tool.name);
			expect(offers, tool.name).toBe(changes && stamped);
		}
	});

	it('changes the row when nothing moved it, and answers with the new stamp', () => {
		const { id } = answered(call('add_task', { title: 'paint the fence' }));
		const first = answered(call('change_task', { id, notes: 'white' }));
		expect(typeof first.updatedAt).toBe('string');

		const second = answered(
			call('change_task', { id, notes: 'blue', ifUpdatedAt: first.updatedAt })
		);
		expect(second.updatedAt).not.toBe(first.updatedAt);
		expect((second.after as { notes?: string }).notes).toBe('blue');
	});

	it('refuses with a conflict, writes nothing and says the current stamp, when it moved', () => {
		const { id } = answered(call('add_task', { title: 'mow the lawn' }));
		const read = answered(call('change_task', { id, notes: 'front' }));
		// Somebody else changes it in between.
		const theirs = answered(call('change_task', { id, notes: 'back' }));

		const refused = call('change_task', { id, notes: 'side', ifUpdatedAt: read.updatedAt });
		expect(refused.result?.isError).toBe(true);
		expect(refused.result?.structuredContent).toMatchObject({
			code: 'conflict',
			details: { updatedAt: theirs.updatedAt }
		});
		const now = answered(call('tasks', { ids: [id], fields: 'notes' }));
		expect((now.items as { notes: string }[])[0].notes).toBe('back');
	});

	it('holds on a subject other than a task', () => {
		const { id } = answered(call('add_bill', { name: 'water', amount_expected: 3000 }));
		const read = answered(call('change_bill', { id, notes: 'meter 3' }));
		answered(call('change_bill', { id, amount_expected: 3500 }));
		expect(
			call('change_bill', { id, name: 'stale', ifUpdatedAt: read.updatedAt }).result
				?.structuredContent?.code
		).toBe('conflict');
	});
});

describe('requestId', () => {
	const tasksTitled = (title: string, who = OWNER) =>
		database.all('select id from todo_tasks where user_id = ? and title = ?', who, title).length;

	it('answers a resend with the first answer, and makes nothing twice', () => {
		const args = { title: 'call the plumber', requestId: 'r-1' };
		const first = answered(call('add_task', args));
		const again = answered(call('add_task', args));
		expect(again.id).toBe(first.id);
		expect(again.replayed).toBe(true);
		expect(first.replayed).toBeUndefined();
		expect(tasksTitled('call the plumber')).toBe(1);
	});

	it('holds for an addition that is not a create — a tick is not taken back', () => {
		const { id } = answered(call('add_habit', { name: 'stretch' }));
		const args = { id, date: '2026-03-14', requestId: 'tick-1' };
		answered(call('tick_habit', args));
		answered(call('tick_habit', args));
		expect(
			database.all('select id from habit_occurrences where user_id = ? and habit_id = ?', OWNER, id)
		).toHaveLength(1);
	});

	it('refuses the same id for a different call, with a conflict, and makes nothing', () => {
		answered(call('add_task', { title: 'buy stamps', requestId: 'r-2' }));
		const reused = call('add_task', { title: 'buy envelopes', requestId: 'r-2' });
		expect(reused.result?.structuredContent?.code).toBe('conflict');
		expect(tasksTitled('buy envelopes')).toBe(0);
	});

	it('forgets an id once the window has passed', () => {
		const args = { title: 'water the plants', requestId: 'r-3' };
		const first = answered(call('add_task', args));
		clock += REQUEST_REPLAY_WINDOW_MS;
		const later = answered(call('add_task', args));
		expect(later.id).not.toBe(first.id);
		expect(later.replayed).toBeUndefined();
		expect(tasksTitled('water the plants')).toBe(2);
	});

	it('is kept per account: somebody else\u2019s id is never their answer', () => {
		const mine = answered(call('add_task', { title: 'private errand', requestId: 'shared-id' }));
		const theirs = answered(
			call('add_task', { title: 'private errand', requestId: 'shared-id' }, STRANGER)
		);
		expect(theirs.replayed).toBeUndefined();
		expect(theirs.id).not.toBe(mine.id);
		expect(tasksTitled('private errand', STRANGER)).toBe(1);
		// And a different call under the same id is theirs to make, not a conflict with mine.
		answered(call('add_task', { title: 'something else', requestId: 'shared-id-2' }, STRANGER));
		answered(call('add_task', { title: 'not theirs', requestId: 'shared-id-2' }));
	});

	it('writes nothing to remember when the call is refused', () => {
		const refused = call('add_task', { title: 'x', notebookId: 999_999, requestId: 'r-4' });
		expect(refused.result?.isError).toBe(true);
		expect(
			database.all(
				'select id from request_replays where user_id = ? and request_id = ?',
				OWNER,
				'r-4'
			)
		).toHaveLength(0);
	});
});
