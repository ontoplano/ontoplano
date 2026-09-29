import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let audio: typeof import('../src/lib/services/audio');
let tokens: typeof import('../src/lib/server/services/tokens');
let metadata: typeof import('../src/routes/api/v1/audio/[id]/+server');
let file: typeof import('../src/routes/api/v1/audio/[id]/file/+server');
let buildCtx: typeof import('../src/lib/services/ctx').buildCtx;

beforeAll(async () => {
	audio = await import('../src/lib/services/audio');
	tokens = await import('../src/lib/server/services/tokens');
	metadata = await import('../src/routes/api/v1/audio/[id]/+server');
	file = await import('../src/routes/api/v1/audio/[id]/file/+server');
	({ buildCtx } = await import('../src/lib/services/ctx'));
});

const webm = () => Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(20).fill(1)]);

function event(id: number, token: string, method = 'GET', body?: unknown) {
	return {
		params: { id: String(id) },
		request: new Request(`https://example.test/api/v1/audio/${id}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				...(body ? { 'Content-Type': 'application/json' } : {})
			},
			...(body ? { body: JSON.stringify(body) } : {})
		}),
		locals: {}
	} as never;
}

describe('recording API', () => {
	test('checks recording scopes and scopes every id to its owner', async () => {
		const held = await audio.store(buildCtx(OWNER), { bytes: webm() });
		const reader = tokens.createToken(buildCtx(OWNER), {
			name: 'audio reader',
			scopes: ['audio:read']
		}).plaintext;
		const writer = tokens.createToken(buildCtx(OWNER), {
			name: 'audio writer',
			scopes: ['audio:write']
		}).plaintext;
		const stranger = tokens.createToken(buildCtx(STRANGER), {
			name: 'other reader',
			scopes: ['audio:read', 'audio:write']
		}).plaintext;

		const meta = await metadata.GET!(event(held.id, reader));
		expect(meta.status).toBe(200);
		expect((await meta.json()).notes).toBe('');
		expect((await metadata.PATCH!(event(held.id, reader, 'PATCH', { notes: 'no' }))).status).toBe(
			403
		);
		// A write grant includes its matching read grant, as for every room.
		expect((await metadata.GET!(event(held.id, writer))).status).toBe(200);
		expect(
			(await metadata.PATCH!(event(held.id, writer, 'PATCH', { notes: 'yes', onlyIfEmpty: true })))
				.status
		).toBe(200);
		expect(
			(await metadata.PATCH!(event(held.id, writer, 'PATCH', { notes: 'late', onlyIfEmpty: true })))
				.status
		).toBe(409);
		expect((await file.GET!(event(held.id, reader))).headers.get('x-content-type-options')).toBe(
			'nosniff'
		);

		for (const id of [held.id, 999999]) {
			expect((await metadata.GET!(event(id, stranger))).status).toBe(404);
			expect((await metadata.PATCH!(event(id, stranger, 'PATCH', { notes: 'wrong' }))).status).toBe(
				404
			);
			expect((await file.GET!(event(id, stranger))).status).toBe(404);
		}
	});
});
