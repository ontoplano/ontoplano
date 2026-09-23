/**
 * An assistant reaching a picture it is entitled to.
 *
 * 0.181.0 made a file answer to whatever refers to it — over HTTP, with a
 * bearer key. An assistant connected over MCP never holds one: its client
 * keeps the credential and hands out none, so the capability worked for a
 * script with a pasted key and not for the client it was built for. A
 * screenshot dropped into a task was a link the model could read and a picture
 * it could not see.
 *
 * The rule is unchanged and is the same function the HTTP route asks. What
 * this pins is that the tool asks it: the grant that reads the note gets the
 * picture in the note, a different grant does not, and a file nothing refers
 * to is reachable by nobody.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method: string; params?: unknown };

let handleBody: typeof import('../src/lib/server/mcp/protocol').handleBody;
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;
let ctx: ReturnType<typeof buildCtx>;
/** The id of a picture written into a note, and one written into a task. */
let inNote = 0;
let onTask = 0;
let loose = 0;

/** The smallest valid GIF there is, so `sniff` takes it. */
const GIF = Uint8Array.from([
	0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
	0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
	0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
]);

/** The same bytes twice would be the same row: `store` is by hash. */
const gifNumbered = (n: number) => Uint8Array.from([...GIF.slice(0, -1), n, 0x3b]);

beforeAll(async () => {
	({ handleBody } = await import('../src/lib/server/mcp/protocol'));
	({ buildCtx } = await import('../src/lib/services/ctx'));
	ctx = buildCtx(OWNER, { tz: 'UTC' });

	const { store } = await import('../src/lib/services/media');
	const { createEntry } = await import('../src/lib/services/diary');
	const { createTodo } = await import('../src/lib/services/todos');

	inNote = (await store(ctx, { bytes: gifNumbered(1), filename: 'wall.gif' })).id;
	onTask = (await store(ctx, { bytes: gifNumbered(2), filename: 'tap.gif' })).id;
	loose = (await store(ctx, { bytes: gifNumbered(3), filename: 'nobody.gif' })).id;

	createEntry(ctx, { content: `the wall ![w](/media/${inNote})` });
	createTodo(ctx, { title: 'ring the plumber', notes: `![tap](/media/${onTask})` });
});

function call(scopes: string[], path: string) {
	const message: Rpc = {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name: 'media', arguments: { path } }
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return handleBody({ ctx, scopes } as any, message) as any;
}

describe('the media tool', () => {
	test('hands over a picture in a note to a key that may read notes', () => {
		const answer = call(['notes:read'], `/media/${inNote}`);
		expect(answer.result.isError).toBe(false);
		expect(answer.result.content[0].type).toBe('image');
		expect(answer.result.content[0].mimeType).toBe('image/gif');
		// The bytes themselves, not a description of them.
		const bytes = Buffer.from(answer.result.content[0].data, 'base64');
		expect(bytes.subarray(0, 3).toString()).toBe('GIF');
	});

	test('takes the link the way the writing writes it', () => {
		for (const said of [`/media/${inNote}`, `media/${inNote}`, String(inNote)])
			expect(call(['notes:read'], said).result.isError).toBe(false);
	});

	test('refuses a picture whose referrer this key may not read', () => {
		// A picture on a task, asked for by a key that may only read notes.
		const answer = call(['notes:read'], `/media/${onTask}`);
		expect(answer.result.isError).toBe(true);
		// And the same key with `tasks:read` gets it.
		expect(call(['tasks:read'], `/media/${onTask}`).result.isError).toBe(false);
	});

	test('a file nothing refers to is reachable by nobody', () => {
		const every = ['notes:read', 'ideas:read', 'tasks:read', 'people:read', 'kitchen:read'];
		expect(call(every, `/media/${loose}`).result.isError).toBe(true);
	});

	test('is not offered to a key holding none of the reading grants', () => {
		const listed = handleBody(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			{ ctx, scopes: ['habits:read'] } as any,
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' } as Rpc
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		) as any;
		expect(listed.result.tools.map((t: { name: string }) => t.name)).not.toContain('media');
		// And calling it anyway is refused, not quietly served.
		expect(call(['habits:read'], `/media/${inNote}`).result.isError).toBe(true);
	});
});
