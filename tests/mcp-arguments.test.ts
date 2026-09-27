import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OWNER, makeDatabase, seedAccounts } from './helpers/db';

/**
 * A call is held to the schema its tool advertised, before anything runs.
 *
 * Every tool publishes `additionalProperties: false` and typed arguments, and
 * for a long time nothing checked either: a misspelt argument vanished, a
 * string reached a service that wanted a number, and a list of forty
 * thousand ids was looked up one by one. These pin the checker down shape by
 * shape, the leniences the descriptions promise, the envelope around a call,
 * and the ceilings on what one request may cost.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Answer = {
	id?: unknown;
	error?: { code: number; message: string; data?: Record<string, unknown> };
	result?: {
		isError?: boolean;
		content?: { text: string }[];
		structuredContent?: Record<string, unknown>;
		tools?: unknown[];
	};
};

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let MAX_BATCH_ANSWER_BYTES: number;
let MAX_MCP_BODY_BYTES: number;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let TOOLS: typeof import('../src/lib/server/mcp/tools').TOOLS;
let SCOPES: typeof import('../src/lib/server/services/tokens').SCOPES;
let args: typeof import('../src/lib/server/mcp/arguments');
let readTextWithin: typeof import('../src/lib/json-body').readTextWithin;
let endpoint: typeof import('../src/routes/api/mcp/+server');
let secret = '';

beforeAll(async () => {
	({ handleBody, MAX_BATCH_ANSWER_BYTES, MAX_MCP_BODY_BYTES } =
		await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	({ TOOLS } = await import('../src/lib/server/mcp/tools'));
	({ SCOPES } = await import('../src/lib/server/services/tokens'));
	args = await import('../src/lib/server/mcp/arguments');
	({ readTextWithin } = await import('../src/lib/json-body'));
	endpoint = await import('../src/routes/api/mcp/+server');

	const { createToken } = await import('../src/lib/server/services/tokens');
	secret = createToken(buildCtx(OWNER), { name: 'assistant', scopes: ['today:read'] }).plaintext;
});

const caller = (extra: Record<string, unknown> = {}) =>
	({
		ctx: buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') }),
		scopes: Object.keys(SCOPES),
		...extra
	}) as never;

function call(name: string, given: unknown, extra: Record<string, unknown> = {}): Answer {
	return handleBody(caller(extra), {
		jsonrpc: '2.0',
		id: 7,
		method: 'tools/call',
		params: { name, arguments: given }
	}) as Answer;
}

const todos = () => database.all('select id from todo_tasks where user_id = ?', OWNER).length;

describe('the schemas themselves', () => {
	it('use only keywords the checker holds, or ones that only describe', () => {
		const known = new Set<string>([...args.CHECKED_KEYWORDS, ...args.DESCRIPTIVE_KEYWORDS]);
		const unknown: string[] = [];
		const walk = (node: Record<string, unknown>, at: string) => {
			for (const key of Object.keys(node)) if (!known.has(key)) unknown.push(`${at}: ${key}`);
			for (const [name, child] of Object.entries(
				(node.properties ?? {}) as Record<string, Record<string, unknown>>
			))
				walk(child, `${at}.${name}`);
			if (node.items) walk(node.items as Record<string, unknown>, `${at}[]`);
			if (typeof node.additionalProperties === 'object')
				walk(node.additionalProperties as Record<string, unknown>, `${at}{}`);
		};
		for (const tool of TOOLS) walk(tool.input as Record<string, unknown>, tool.name);
		expect(unknown).toEqual([]);
	});
});

describe('an argument of the wrong shape', () => {
	const refusal = (name: string, given: unknown) => {
		const answer = call(name, given);
		expect(answer.result, JSON.stringify(answer)).toBeUndefined();
		expect(answer.error?.code).toBe(-32602);
		// Every refusal carries the same stable code the JSON API uses; the
		// rest of `data` is what each case below is about.
		const { code, ...data } = answer.error!.data ?? {};
		expect(code).toBe('validation_error');
		return { ...answer.error!, data };
	};

	it('is refused when the schema does not name it', () => {
		const error = refusal('add_task', { title: 'x', titel: 'y' });
		expect(error.data).toEqual({ argument: 'titel', problem: 'unknown' });
		expect(error.message).toBe('`titel` is not an argument this tool takes.');
	});

	it('is refused when it is required and missing, or null', () => {
		expect(refusal('add_task', {}).data).toEqual({ argument: 'title', problem: 'missing' });
		expect(refusal('add_task', { title: null }).data).toEqual({
			argument: 'title',
			problem: 'missing'
		});
	});

	it('is refused for the wrong type, a number in a string included', () => {
		expect(refusal('change_task', { id: '12' }).data).toEqual({
			argument: 'id',
			problem: 'type',
			expected: 'integer'
		});
		expect(refusal('change_task', { id: 1.5 }).data).toMatchObject({ problem: 'type' });
		expect(refusal('tasks', { verbose: 'yes' }).data).toMatchObject({
			argument: 'verbose',
			expected: 'boolean'
		});
		expect(refusal('add_task', { title: ['x'] }).data).toMatchObject({ expected: 'string' });
	});

	it('is refused outside its enum', () => {
		const error = refusal('tasks', { status: 'maybe' });
		expect(error.data).toMatchObject({ argument: 'status', problem: 'enum' });
		expect(error.message).toMatch(/^`status` has to be one of: /);
	});

	it('is refused outside its bounds', () => {
		expect(refusal('up_next', { minEase: 9 }).data).toEqual({
			argument: 'minEase',
			problem: 'range',
			expected: { minimum: 0, maximum: 5 }
		});
		expect(refusal('up_next', { minEase: 9 }).message).toBe('`minEase` has to be between 0 and 5.');
	});

	it('is refused inside a list, by its place in it', () => {
		expect(refusal('cooked_recipe', { id: 1, ranOutOf: [1, 'milk'] }).data).toEqual({
			argument: 'ranOutOf[1]',
			problem: 'type',
			expected: 'integer'
		});
	});

	it('is refused inside an object in a list, and for a key the object does not take', () => {
		const target = TOOLS.find((t) => t.name === 'add_goal')!;
		const shape = (target.input.properties.targets as { items: { properties: object } }).items;
		const [numeric] = Object.entries(shape.properties).find(
			([, spec]) => (spec as { type: string }).type === 'number'
		)!;
		expect(
			refusal('add_goal', { title: 'x', horizon: 'week', targets: [{ [numeric]: 'lots' }] }).data
		).toMatchObject({ argument: `targets[0].${numeric}`, problem: 'type' });
	});

	it('is refused as a map value that is not a string', () => {
		expect(refusal('add_task', { title: 'x', attributes: { room: 12 } }).data).toEqual({
			argument: 'attributes.room',
			problem: 'type',
			expected: 'string'
		});
	});

	it('is refused as a list longer than any tool takes', () => {
		const ids = Array.from({ length: args.MAX_ARGUMENT_ITEMS + 1 }, (_, i) => i + 1);
		expect(refusal('tasks', { ids }).data).toEqual({
			argument: 'ids',
			problem: 'too_many',
			expected: args.MAX_ARGUMENT_ITEMS
		});
	});

	it('is refused before the tool runs, so nothing is written', () => {
		const before = todos();
		refusal('add_task', { title: 'should not exist', bogus: true });
		refusal('add_task', { title: 'should not exist', urgency: 'high' });
		expect(todos()).toBe(before);
	});

	it('is refused whatever the arguments are, when they are not an object', () => {
		const answer = call('tasks', ['not', 'an', 'object']);
		expect(answer.error).toMatchObject({ code: -32602, data: { argument: 'arguments' } });
	});
});

describe('what the descriptions promise', () => {
	it('reads `null` for an optional argument as not given', () => {
		const answer = call('tasks', { status: null, limit: null });
		expect(answer.error).toBeUndefined();
		expect(answer.result?.isError).not.toBe(true);
	});

	it('takes a list of words as one string of them', () => {
		expect(call('tasks', { tags: 'u5, i5' }).error).toBeUndefined();
		expect(args.argumentProblem({ type: 'array', items: { type: 'integer' } }, '1,2')).toEqual({
			argument: '',
			problem: 'type',
			expected: 'array'
		});
	});

	it('keeps every deprecated argument working, whatever shape it was sent in', () => {
		const deprecated = TOOLS.flatMap((tool) =>
			Object.entries(tool.input.properties)
				.filter(([, spec]) => (spec as { deprecated?: boolean }).deprecated)
				.map(([name]) => ({ tool, name }))
		);
		expect(deprecated.length).toBeGreaterThan(5);

		for (const { tool, name } of deprecated) {
			const required = Object.fromEntries(
				(tool.input.required ?? []).map((key) => [key, 1] as const)
			);
			// The shape is not the checker's business for these — only the name.
			const problem = args.argumentProblem(tool.input, { ...required, [name]: '{"a":"b"}' });
			expect(problem?.argument === name ? problem : null, `${tool.name}.${name}`).toBeNull();
		}
	});

	it('answers a deprecated argument through the tool, as before', () => {
		const single = call('tasks', { tag: 'nothing-carries-this' });
		expect(single.error).toBeUndefined();
		expect(single.result?.structuredContent?.warning).toMatch(/deprecated/);

		const before = todos();
		const meta = call('add_task', { title: 'meta as a string', meta: '{"room":"b12"}' });
		expect(meta.error, JSON.stringify(meta)).toBeUndefined();
		expect(meta.result?.isError).not.toBe(true);
		expect(todos()).toBe(before + 1);
	});
});

describe('the envelope', () => {
	const one = (message: unknown) => handleBody(caller(), message) as Answer;

	it('refuses a message that is not an object, in a batch too', () => {
		expect(one('ping')).toMatchObject({ id: null, error: { code: -32600 } });
		const batch = handleBody(caller(), [1, { jsonrpc: '2.0', id: 2, method: 'ping' }]) as Answer[];
		expect(batch).toHaveLength(2);
		expect(batch[0]).toMatchObject({ id: null, error: { code: -32600 } });
		expect(batch[1]).toMatchObject({ id: 2, result: {} });
	});

	it('refuses a method that is not a string, and says so with the id it was given', () => {
		expect(one({ jsonrpc: '2.0', id: 3, method: 42 })).toMatchObject({
			id: 3,
			error: { code: -32600 }
		});
	});

	it('refuses an id that is not a string or a whole number, answering to null', () => {
		expect(one({ jsonrpc: '2.0', id: { a: 1 }, method: 'ping' })).toMatchObject({
			id: null,
			error: { code: -32600 }
		});
		expect(one({ jsonrpc: '2.0', id: 1.5, method: 'ping' })).toMatchObject({ id: null });
	});

	it('refuses params that are not an object, and members JSON-RPC does not have', () => {
		expect(one({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: [] })).toMatchObject({
			error: { code: -32600 }
		});
		expect(one({ jsonrpc: '2.0', id: 5, method: 'ping', extra: true })).toMatchObject({
			error: { code: -32600, message: '`extra` is not part of a JSON-RPC request.' }
		});
	});

	it('answers a malformed message even without an id, since it is not a notification', () => {
		expect(one({ jsonrpc: '1.0', method: 'ping' })).toMatchObject({
			id: null,
			error: { code: -32600 }
		});
	});

	it('refuses a call that names no tool', () => {
		expect(one({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: {} })).toMatchObject({
			error: { code: -32602, data: { argument: 'name', problem: 'missing' } }
		});
	});
});

describe('what one request may cost', () => {
	it('stops running a batch once its answers pass the ceiling, and runs nothing after', () => {
		const list = { jsonrpc: '2.0', method: 'tools/list' };
		const size = JSON.stringify(handleBody(caller(), { ...list, id: 0 })).length;
		const lists = Math.ceil(MAX_BATCH_ANSWER_BYTES / size) + 1;
		expect(lists, 'the ceiling is below one batch of listings').toBeLessThan(49);

		const before = todos();
		const answers = handleBody(caller(), [
			...Array.from({ length: lists }, (_, i) => ({ ...list, id: i })),
			{
				jsonrpc: '2.0',
				id: 'late write',
				method: 'tools/call',
				params: { name: 'add_task', arguments: { title: 'never run' } }
			},
			{ jsonrpc: '2.0', method: 'notifications/initialized' }
		]) as Answer[];

		expect(answers).toHaveLength(lists + 1);
		const late = answers.at(-1)!;
		expect(late).toMatchObject({ id: 'late write', error: { code: -32000 } });
		expect(todos()).toBe(before);
		expect(answers.filter((a) => a.error).length).toBeGreaterThan(0);
	});

	it('spends the call budget before resolving references, so a guess costs a call', () => {
		const budget = { tokenId: 424242 };
		let refused = 0;
		for (let i = 0; i < 200 && refused === 0; i++) {
			const answer = call('change_task', { id: 900000 + i, title: 'x' }, budget);
			if (/Too many requests/.test(answer.result?.content?.[0]?.text ?? '')) refused = i;
		}
		// The write budget, spent entirely on ids that name nothing.
		expect(refused).toBeGreaterThan(0);
		expect(refused).toBeLessThan(200);
	});

	it('reads a body only up to the ceiling, counting bytes as they arrive', async () => {
		const chunk = new Uint8Array(64 * 1024).fill(0x20);
		let pulled = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				if (pulled > 100) controller.close();
				else controller.enqueue(chunk);
			}
		});
		const request = new Request('http://localhost/x', {
			method: 'POST',
			body: stream,
			// @ts-expect-error — Node wants this for a streamed body
			duplex: 'half'
		});
		expect(await readTextWithin(request, 256 * 1024)).toBeNull();
		expect(pulled).toBeLessThan(10);

		// Bytes, not characters: 100 three-byte characters are 300 bytes.
		const wide = new Request('http://localhost/x', { method: 'POST', body: '€'.repeat(100) });
		expect(await readTextWithin(wide, 299)).toBeNull();
	});

	it('refuses a body past the ceiling at the endpoint with a 413', async () => {
		const post = (body: string) =>
			endpoint.POST({
				request: new Request('http://localhost/api/mcp', {
					method: 'POST',
					headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
					body
				}),
				url: new URL('http://localhost/api/mcp')
			} as never);

		const padding = ' '.repeat(MAX_MCP_BODY_BYTES);
		const big = await post(`{"jsonrpc":"2.0","id":1,"method":"ping"}${padding}`);
		expect(big.status).toBe(413);
		expect(await big.json()).toMatchObject({ error: { code: -32600 } });

		const small = await post('{"jsonrpc":"2.0","id":1,"method":"ping"}');
		expect(small.status).toBe(200);

		const garbled = await post('{"jsonrpc":');
		expect(garbled.status).toBe(400);
		expect(await garbled.json()).toMatchObject({ error: { code: -32700 } });
	});
});
