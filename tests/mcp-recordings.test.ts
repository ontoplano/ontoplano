/**
 * Recordings over MCP: listed, renamed, and their notes written.
 *
 * `media` could fetch a recording's sound given a link somebody had written
 * down, and nothing could find the recordings or put words beside them. Who
 * may reach which recording is `mcp-idor.test.ts`; this is what the two tools
 * do to the one they are given.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let tool: (name: string) => (typeof import('../src/lib/server/mcp/tools'))['TOOLS'][number];
let ctx: import('../src/lib/services/ctx').Ctx;
let made: number;

beforeAll(async () => {
	const { TOOLS } = await import('../src/lib/server/mcp/tools');
	const { buildCtx } = await import('../src/lib/services/ctx');
	const { store } = await import('../src/lib/services/audio');
	tool = (name) => TOOLS.find((one) => one.name === name)!;
	ctx = buildCtx(OWNER);
	made = (
		await store(ctx, {
			bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Array(20).fill(1)]),
			name: 'standup',
			notes: 'what was said'
		})
	).id;
});

test('the list carries each one with the link media takes', () => {
	const listed = tool('recordings').run(ctx, {}) as { items: Record<string, unknown>[] };
	expect(listed.items).toContainEqual(
		expect.objectContaining({ id: made, name: 'standup', link: `/media/audio/${made}` })
	);
});

test('a rename leaves the notes, and notes leave the name', () => {
	const change = tool('change_recording');
	expect(change.run(ctx, { id: made, name: 'monday standup' })).toMatchObject({
		name: 'monday standup',
		notes: 'what was said'
	});
	expect(change.run(ctx, { id: made, notes: 'the transcript' })).toMatchObject({
		name: 'monday standup',
		notes: 'the transcript'
	});
	expect(change.run(ctx, { id: made, notes: '' })).toMatchObject({ notes: '' });
});
