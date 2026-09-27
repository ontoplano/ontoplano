/**
 * A refusal says what kind of refusal it is, in a word software can branch on.
 *
 * The sentence is for the model; `code` is for the client around it. It is
 * the vocabulary the JSON API already answers with, so one handler reads both.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Answer = {
	error?: { code: number; data?: Record<string, unknown> };
	result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
};

let call: (name: string, args: Record<string, unknown>, scopes?: string[]) => Answer;
let ERROR_CODES: readonly string[];

beforeAll(async () => {
	const { buildCtx } = await import('../src/lib/services/ctx');
	const { handleBody } = await import('../src/lib/server/mcp/protocol');
	const { ASSISTANT_SCOPES } = await import('../src/lib/server/mcp/tools');
	({ ERROR_CODES } = await import('../src/lib/services/errors'));
	const ctx = buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
	call = (name, args, scopes = [...ASSISTANT_SCOPES]) =>
		handleBody({ ctx, scopes } as never, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: args }
		}) as Answer;
});

const refusal = (answer: Answer) => {
	expect(answer.result?.isError).toBe(true);
	return answer.result!.structuredContent!;
};

describe('a tool refusal', () => {
	it('names a thing that is not there as not_found', () => {
		const said = refusal(call('change_task', { id: 999_999, title: 'x' }));
		expect(said.code).toBe('not_found');
		expect(typeof said.message).toBe('string');
	});

	it('names a value the service would not take as validation_error', () => {
		const made = call('add_task', { title: 'a task' }).result!.structuredContent!;
		expect(refusal(call('schedule_task', { id: made.id, date: 'soon' })).code).toBe(
			'validation_error'
		);
	});

	it('names a grant the key does not hold as forbidden', () => {
		expect(refusal(call('add_task', { title: 'x' }, ['tasks:read'])).code).toBe('forbidden');
	});

	it('uses only the codes the JSON API uses', () => {
		const said = refusal(call('change_task', { id: 999_999, title: 'x' }));
		expect(ERROR_CODES).toContain(said.code);
	});
});

describe('an argument refusal', () => {
	it('carries validation_error beside the argument it names', () => {
		const { error } = call('add_task', { title: 'x', titel: 'y' });
		expect(error?.code).toBe(-32602);
		expect(error?.data).toMatchObject({
			code: 'validation_error',
			argument: 'titel',
			problem: 'unknown'
		});
	});
});
