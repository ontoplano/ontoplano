/**
 * How `<img src="/media/3">` finds a picture when there is no server.
 *
 * Everything else the app asks for goes through `fetch`, which the bridge
 * sits on. An image does not: the browser loads it itself, and no amount of
 * patching `window.fetch` is ever consulted. Nor can the address be swapped
 * for a `blob:` one in the components, because pictures also arrive inside
 * rendered markdown — a note that quotes a photograph writes `/media/12` into
 * its own text.
 *
 * So the service worker, which sees every request a page makes including that
 * one, asks the page for the bytes, and the page asks the database worker.
 * Three hops, but each is somebody already in the room: the page is the only
 * one holding a handle on the database, and the service worker is the only
 * one an `<img>` cannot go around.
 */
import { ask } from './client.js';
import { PICTURE_REQUEST, type PictureReply, type PictureRequest } from './picture-protocol.js';

let listening = false;

/** Answer the service worker's requests for pictures, for as long as this page lives. */
export function servePicturesToServiceWorker(): void {
	if (listening || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
	listening = true;

	navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
		const message = event.data as PictureRequest | undefined;
		if (message?.kind !== PICTURE_REQUEST) return;
		const port = event.ports[0];
		if (!port) return;

		void ask<{ mime: string; filename: string; bytes: Uint8Array }>('media.read', {
			id: message.id
		})
			.then((picture) => {
				// Copied out of its view and handed over rather than cloned: the
				// bytes cross to the service worker once, not twice.
				const bytes = new Uint8Array(picture.bytes).buffer;
				const reply: PictureReply = {
					ok: true,
					mime: picture.mime,
					filename: picture.filename,
					bytes
				};
				port.postMessage(reply, [bytes]);
			})
			.catch((e: unknown) => {
				const reply: PictureReply = { ok: false, message: String((e as Error)?.message ?? e) };
				port.postMessage(reply);
			});
	});
}
