import type { RequestHandler } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { readRingtone } from '$lib/server/services/ringtones';

/**
 * One uploaded sound, played by the page that raises a notification.
 *
 * Yours or nothing: the lookup is scoped to the account, so an id belonging to
 * somebody else is a 404 and not a quiet leak of three hundred kilobytes.
 * Cached hard because the bytes never change — a ringtone is replaced by
 * uploading another one under another name, not by editing this one.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return new Response('Not found', { status: 404 });

	try {
		const { mime, data } = readRingtone(buildCtx(locals.user.id), Number(params.id));
		return new Response(new Uint8Array(data), {
			headers: {
				'content-type': mime,
				'content-length': String(data.byteLength),
				// Same armour as /media: the type is a stored claim, so a browser
				// must not second-guess it, and a document that slips through is
				// inert as a page.
				'x-content-type-options': 'nosniff',
				'content-security-policy': "default-src 'none'; sandbox",
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch {
		return new Response('Not found', { status: 404 });
	}
};
