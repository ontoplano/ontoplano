import type { RequestHandler } from './$types';

import { FAVICON_ICO_BASE64 } from '$lib/logo/favicon-ico';

/**
 * The icon nothing links to and everything asks for.
 *
 * A browser fetches this before it has read a line of the page, and so does
 * anything that wants a picture for a link without rendering one — a chat
 * unfurling a URL, a feed reader, the card an assistant draws for a connector
 * it is about to connect to. There was no such file here, so the request fell
 * through to the SPA fallback and every one of those callers was handed a page
 * where an image should have been. What they drew instead was whatever they
 * had cached, which in one case was the logo this app stopped using a year ago.
 *
 * A route rather than a file in `static/`, because the static server the node
 * adapter bundles has no mime entry for this extension: the bytes went out
 * correct with no content type at all, and the `nosniff` header this app sends
 * on everything then forbids the browser from working out what it is holding.
 *
 * The bytes arrive as a generated module rather than through `$app/server`'s
 * `read`. That is an adapter feature — the static adapter the device build
 * uses does not have it, and the node build tripped over the asset's own
 * bookkeeping mid-`vite build`. `scripts/build-icons.mjs` writes both the
 * `.ico` and `favicon-ico.ts` from the same artwork as every other icon, so
 * this cannot be the one that stays behind.
 */
const TYPE = 'image/vnd.microsoft.icon';
/** A week. The name never changes, and neither does what it means. */
const CACHE = 'public, max-age=604800';

/** Decoded once per process rather than per request. */
const BYTES = Uint8Array.from(Buffer.from(FAVICON_ICO_BASE64, 'base64'));

export const GET: RequestHandler = () =>
	new Response(BYTES, { headers: { 'content-type': TYPE, 'cache-control': CACHE } });
