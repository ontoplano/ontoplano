import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export const MAX_WEBHOOK_BYTES = 16_384;
export const MAX_EVENT_AGE_MS = 5 * 60_000;
export const MAX_TRANSCRIPT_CHARS = 100_000;
export const MODEL = 'whisper-1';

const extension = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/mpeg': 'mp3'
};

export function verifyWebhook(raw, signature, secret) {
	if (!signature?.startsWith('sha256=') || !secret) return false;
	const expected = createHmac('sha256', secret).update(raw).digest();
	const given = signature.slice(7);
	if (!/^[a-f0-9]{64}$/i.test(given)) return false;
	return timingSafeEqual(expected, Buffer.from(given, 'hex'));
}

function apiUrl(base, path) {
	return new URL(path, base.endsWith('/') ? base : `${base}/`);
}

async function api(fetcher, config, path, init = {}) {
	const response = await fetcher(apiUrl(config.ontoplanoUrl, path), {
		...init,
		headers: { Authorization: `Bearer ${config.ontoplanoToken}`, ...init.headers },
		signal: AbortSignal.timeout(config.timeoutMs)
	});
	if (!response.ok) throw new Error(`Ontoplano ${path}: HTTP ${response.status}`);
	return response;
}

export async function transcribeRecording(id, config, fetcher = fetch) {
	const path = `api/v1/audio/${id}`;
	const recording = await (await api(fetcher, config, path)).json();
	if (recording.notes) return 'already noted';
	if (!extension[recording.mime]) throw new Error(`Unsupported audio type: ${recording.mime}`);
	const bytes = await (await api(fetcher, config, `${path}/file`)).arrayBuffer();
	const form = new FormData();
	form.set('model', MODEL);
	form.set(
		'file',
		new File([bytes], `recording.${extension[recording.mime]}`, {
			type: recording.mime
		})
	);
	const answer = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${config.openaiKey}` },
		body: form,
		signal: AbortSignal.timeout(config.timeoutMs)
	});
	if (!answer.ok) throw new Error(`Whisper: HTTP ${answer.status}`);
	const { text } = await answer.json();
	if (typeof text !== 'string' || !text.trim())
		throw new Error('Whisper returned no transcription');
	if (text.length > MAX_TRANSCRIPT_CHARS)
		throw new Error('Transcription exceeds recording notes limit');
	const update = await fetcher(apiUrl(config.ontoplanoUrl, path), {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${config.ontoplanoToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ notes: text.trim(), onlyIfEmpty: true }),
		signal: AbortSignal.timeout(config.timeoutMs)
	});
	if (update.status === 409) return 'already noted';
	if (!update.ok) throw new Error(`Ontoplano ${path}: HTTP ${update.status}`);
	return 'transcribed';
}

export function createReceiver(config, fetcher = fetch) {
	const active = new Set();
	return createServer(async (request, response) => {
		if (request.method !== 'POST' || request.url !== '/webhook') {
			response.writeHead(404).end();
			return;
		}
		let raw = Buffer.alloc(0);
		try {
			for await (const part of request) {
				raw = Buffer.concat([raw, part]);
				if (raw.length > MAX_WEBHOOK_BYTES) {
					response.writeHead(413).end();
					return;
				}
			}
			if (!verifyWebhook(raw, request.headers['x-ontoplano-signature'], config.webhookSecret)) {
				response.writeHead(401).end();
				return;
			}
			const event = JSON.parse(raw.toString('utf8'));
			const at = Date.parse(event.at);
			if (
				event.event !== 'audio.uploaded' ||
				request.headers['x-ontoplano-event'] !== event.event ||
				!Number.isSafeInteger(event.data?.id) ||
				event.data.id <= 0 ||
				!Number.isFinite(at) ||
				Math.abs(Date.now() - at) > MAX_EVENT_AGE_MS
			) {
				response.writeHead(400).end();
				return;
			}
			const id = event.data.id;
			response.writeHead(202).end();
			if (active.has(id)) return;
			active.add(id);
			void transcribeRecording(id, config, fetcher)
				.catch((error) => console.error(`Recording ${id}:`, error))
				.finally(() => active.delete(id));
		} catch (error) {
			console.error('Webhook:', error);
			if (!response.headersSent) response.writeHead(400).end();
		}
	});
}

export function configFromEnv(env = process.env) {
	for (const name of ['ONTOPLANO_URL', 'ONTOPLANO_TOKEN', 'OPENAI_API_KEY', 'WEBHOOK_SECRET']) {
		if (!env[name]) throw new Error(`${name} is required`);
	}
	const url = new URL(env.ONTOPLANO_URL);
	if (!['https:', 'http:'].includes(url.protocol)) throw new Error('ONTOPLANO_URL must be HTTP(S)');
	const port = Number(env.PORT ?? 8080);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
	return {
		ontoplanoUrl: url.toString(),
		ontoplanoToken: env.ONTOPLANO_TOKEN,
		openaiKey: env.OPENAI_API_KEY,
		webhookSecret: env.WEBHOOK_SECRET,
		port,
		timeoutMs: 120_000
	};
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	const config = configFromEnv();
	createReceiver(config).listen(config.port, () => console.log(`Listening on ${config.port}`));
}
