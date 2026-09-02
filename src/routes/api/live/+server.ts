import type { RequestHandler } from './$types';

import { listen, type LiveChange } from '$lib/server/live';

/**
 * The stream a tab holds open to hear that its data moved.
 *
 * Session only — no bearer token. A token is for something acting *on* the
 * account from outside; this is the account's own browser being told what that
 * something did, and there is no reason to hand a script a tap on somebody's
 * activity.
 *
 * ## The two lines that are not optional
 *
 * `X-Accel-Buffering: no` turns off nginx's response buffering for this
 * response only. Without it nginx holds the bytes until its buffer fills, which
 * for a stream of 60-byte messages is never — so the page hears nothing for
 * minutes and then everything at once. `Cache-Control: no-store` stops anything
 * in between deciding a stream is a document worth keeping.
 *
 * The heartbeat is a comment line every 25 seconds. It carries nothing; it
 * exists because proxies close idle connections at 30 or 60, and a stream that
 * dies silently is one where `EventSource` waits its full backoff before
 * noticing.
 */
const HEARTBEAT_MS = 25_000;

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return new Response('Sign in first\n', { status: 401 });

	let stop: (() => void) | null = null;
	let beat: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (text: string) => {
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					// The tab went away between the change and this write. Nothing
					// to do about it and nothing worth logging.
					close();
				}
			};

			const close = () => {
				stop?.();
				stop = null;
				if (beat) clearInterval(beat);
				beat = null;
			};

			// Said immediately, so a client knows the stream is live rather than
			// merely accepted — and so anything buffering has something to flush.
			send(`retry: 3000\n\n`);
			send(`: open\n\n`);

			stop = listen(user.id, (change: LiveChange) => {
				send(`event: changed\ndata: ${JSON.stringify(change)}\n\n`);
			});

			beat = setInterval(() => send(`: beat\n\n`), HEARTBEAT_MS);
		},

		cancel() {
			stop?.();
			stop = null;
			if (beat) clearInterval(beat);
			beat = null;
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-store',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
