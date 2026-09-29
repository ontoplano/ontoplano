import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createReceiver, transcribeRecording, verifyWebhook } from './audio-transcriber.mjs';

const config = {
	ontoplanoUrl: 'https://example.test/',
	ontoplanoToken: 'scoped-test-token',
	openaiKey: 'openai-test-key',
	webhookSecret: 'test-secret',
	timeoutMs: 1000
};

const servers = [];
afterEach(async () => {
	await Promise.all(
		servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
	);
});

test('verifies the raw webhook body', () => {
	const raw = Buffer.from('{"id":1}');
	const signature =
		'sha256=' + createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
	assert.equal(verifyWebhook(raw, signature, config.webhookSecret), true);
	assert.equal(verifyWebhook(Buffer.from('{"id":2}'), signature, config.webhookSecret), false);
	assert.equal(verifyWebhook(raw, 'sha256=bad', config.webhookSecret), false);
});

test('transcribes a scoped recording and preserves notes written meanwhile', async () => {
	const requests = [];
	const fetcher = async (url, init = {}) => {
		requests.push({ url: String(url), init });
		if (String(url).endsWith('/file')) return new Response(Buffer.from('ID3recording'));
		if (String(url).includes('openai.com')) {
			assert.equal(init.body.get('model'), 'whisper-1');
			assert.equal(init.body.get('file').name, 'recording.mp3');
			return Response.json({ text: 'The spoken words.' });
		}
		if (init.method === 'PATCH') {
			assert.deepEqual(JSON.parse(init.body), { notes: 'The spoken words.', onlyIfEmpty: true });
			return new Response(null, { status: 409 });
		}
		return Response.json({ mime: 'audio/mpeg', notes: '' });
	};
	assert.equal(await transcribeRecording(42, config, fetcher), 'already noted');
	assert.equal(requests.length, 4);
	assert.ok(requests[0].init.headers.Authorization.startsWith('Bearer '));
});

test('rejects unsigned events and accepts only a fresh audio upload', async () => {
	let calls = 0;
	const server = createReceiver(config, async () => {
		calls++;
		return Response.json({ mime: 'audio/mpeg', notes: 'already done' });
	});
	servers.push(server);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const url = `http://127.0.0.1:${server.address().port}/webhook`;
	const body = JSON.stringify({
		event: 'audio.uploaded',
		at: new Date().toISOString(),
		data: { id: 42 }
	});
	assert.equal((await fetch(url, { method: 'POST', body })).status, 401);
	const signature =
		'sha256=' + createHmac('sha256', config.webhookSecret).update(body).digest('hex');
	assert.equal(
		(
			await fetch(url, {
				method: 'POST',
				body,
				headers: { 'x-ontoplano-event': 'audio.uploaded', 'x-ontoplano-signature': signature }
			})
		).status,
		202
	);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(calls, 1);
});
