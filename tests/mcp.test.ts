import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * The protocol an assistant speaks to this app, and the fence around it.
 *
 * Two kinds of thing are checked here and they are not the same kind. The
 * protocol half is a contract with somebody else's client: a malformed message
 * must come back as a JSON-RPC error rather than a crash, a notification must
 * get no answer at all, and `tools/list` must describe tools a model has never
 * seen well enough to pick between them.
 *
 * The scope half is the fence. A token holds the scopes it was granted, a tool
 * names the one it needs, and the two are compared on every call — not once at
 * `tools/list`. A client that calls a tool it was never offered is exactly the
 * case worth testing, because it is the one an attacker tries.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: unknown };

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/server/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/server/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
});

const USER = OWNER;

function caller(scopes: string[]) {
	return { ctx: buildCtx(USER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }), scopes };
}

function call(scopes: string[], message: Rpc) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return handleBody(caller(scopes) as any, message) as any;
}

describe('the handshake', () => {
	it('answers initialize with what it is and what it can do', () => {
		const answer = call([], { jsonrpc: '2.0', id: 1, method: 'initialize' });
		expect(answer.result.protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(answer.result.serverInfo.name).toBe('ontoplano');
		// Tools and nothing else: advertising a capability that is not there is
		// how a client ends up calling something that does not answer.
		expect(Object.keys(answer.result.capabilities)).toEqual(['tools']);
		expect(answer.result.instructions).toContain('Ontoplano');
	});

	it('says nothing at all to a notification', () => {
		expect(call([], { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
	});

	it('answers a ping', () => {
		expect(call([], { jsonrpc: '2.0', id: 2, method: 'ping' }).result).toEqual({});
	});

	it('refuses something that is not JSON-RPC 2.0', () => {
		const answer = call([], { jsonrpc: '1.0', id: 3, method: 'ping' } as unknown as Rpc);
		expect(answer.error.code).toBe(-32600);
	});

	it('refuses a method it does not have', () => {
		const answer = call([], { jsonrpc: '2.0', id: 4, method: 'resources/list' });
		expect(answer.error.code).toBe(-32601);
	});

	it('answers a batch with one response per request, and drops the notifications', () => {
		const answer = call(['today:read'], [
			{ jsonrpc: '2.0', id: 1, method: 'ping' },
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		] as any);
		expect(Array.isArray(answer)).toBe(true);
		expect(answer).toHaveLength(2);
		expect(answer.map((a: { id: number }) => a.id)).toEqual([1, 2]);
	});
});

describe('what a token is offered', () => {
	it('lists only the tools its scopes reach', () => {
		const answer = call(['today:read'], { jsonrpc: '2.0', id: 1, method: 'tools/list' });
		expect(answer.result.tools.map((t: { name: string }) => t.name)).toEqual(['today']);
	});

	it('offers a token with no scopes nothing', () => {
		const answer = call([], { jsonrpc: '2.0', id: 1, method: 'tools/list' });
		expect(answer.result.tools).toEqual([]);
	});

	/**
	 * The fence is on the call, not on the listing.
	 *
	 * A client that was never offered a tool can still name it — that is one
	 * line of JSON — so the scope has to be checked where the work happens.
	 */
	it('refuses a tool the token was not offered, and says which scope was missing', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'write_entry', arguments: { content: 'no' } }
		});
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toContain('notes:write');
	});

	it('refuses a tool that does not exist', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'drop_everything', arguments: {} }
		});
		expect(answer.error.code).toBe(-32602);
	});
});

describe('a tool that runs', () => {
	it('answers with the structured thing and the same thing as text', () => {
		const answer = call(['today:read'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'today', arguments: {} }
		});
		expect(answer.result.isError).toBe(false);
		expect(answer.result.structuredContent.date).toBe('2026-03-14');
		expect(JSON.parse(answer.result.content[0].text).date).toBe('2026-03-14');
	});

	it('writes, and the write is the service’s own', () => {
		const made = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: 'Buy garlic' } }
		});
		expect(made.result.isError).toBe(false);
		const id = made.result.structuredContent.id;
		expect(id).toBeGreaterThan(0);

		const listed = call(['tasks:read'], {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'todos', arguments: {} }
		});
		expect(
			listed.result.structuredContent.some((t: { title: string }) => t.title === 'Buy garlic')
		).toBe(true);
	});

	/**
	 * A service's refusal reaches the model as words rather than as a crash.
	 *
	 * `isError` on the result, not a protocol error: the difference is whether
	 * the model can do anything about it, and "that is not a date" is something
	 * it can act on immediately.
	 */
	it('hands a refusal back as something the model can read', () => {
		const answer = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: 'x', scheduledDate: 'thursday' } }
		});
		expect(answer.error).toBeUndefined();
		expect(answer.result.isError).toBe(true);
		expect(answer.result.content[0].text).toMatch(/date/i);
	});

	it('refuses an empty title the way the form does', () => {
		const answer = call(['tasks:write'], {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'add_todo', arguments: { title: '' } }
		});
		expect(answer.result.isError).toBe(true);
	});
});

/**
 * Every tool is described well enough to be chosen correctly.
 *
 * A model picks a tool from its name and its sentence and nothing else. A tool
 * whose description restates its name — "add_todo: adds a todo" — is a tool
 * that gets called for the wrong reasons, and the cost lands in somebody's
 * actual diary.
 */
describe('the descriptions', () => {
	it('say more than the name does', () => {
		for (const tool of TOOLS) {
			expect(tool.description.length, `${tool.name} barely says anything`).toBeGreaterThan(60);
			expect(tool.title.length, `${tool.name} has no title`).toBeGreaterThan(0);
		}
	});

	it('declare a scope that exists', async () => {
		const { ALL_SCOPES } = await import('../src/lib/server/services/tokens');
		for (const tool of TOOLS)
			expect(ALL_SCOPES, `${tool.name} wants a scope nobody can grant`).toContain(tool.scope);
	});

	it('ask a writing tool for a writing scope', () => {
		for (const tool of TOOLS)
			if (tool.writes)
				expect(tool.scope, `${tool.name} writes with a read scope`).toMatch(/:write$/);
	});

	it('take an object, and refuse arguments they do not know', () => {
		for (const tool of TOOLS) {
			expect(tool.input.type).toBe('object');
			expect(tool.input.additionalProperties).toBe(false);
		}
	});
});
