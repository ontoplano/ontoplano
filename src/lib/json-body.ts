/**
 * A JSON body, read defensively.
 *
 * Everything that accepts JSON goes through this: the size is checked before
 * and after reading, and anything that is not a JSON object is refused with
 * the same sentence everywhere. Portable because it needs nothing but the
 * request itself — an isolated instance parses its own posts with it.
 */
import { ValidationError } from '$lib/services/errors.js';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * A request body as text, or null once it passes `maxBytes`.
 *
 * Counted in bytes as they arrive, not in characters after the whole body
 * has been buffered: a declared length is a claim, and a chunked body makes
 * none, so the ceiling is held on the stream itself and the rest is never
 * read. Throws on bytes that are not UTF-8, which no JSON body is.
 */
export async function readTextWithin(request: Request, maxBytes: number): Promise<string | null> {
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) return null;
	if (!request.body) return '';

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}

	const whole = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		whole.set(chunk, at);
		at += chunk.byteLength;
	}
	return new TextDecoder('utf-8', { fatal: true }).decode(whole);
}

/** Parse a JSON request body, with a clear error rather than a 500 on bad input. */
export async function readJson(event: { request: Request }): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		const text = await readTextWithin(event.request, MAX_BODY_BYTES);
		if (text === null) throw new ValidationError({ key: 'errors.jsonBody.requestBodyIsTooLarge' });
		body = JSON.parse(text);
	} catch (e) {
		if (e instanceof ValidationError) throw e;
		throw new ValidationError({ key: 'errors.jsonBody.requestBodyMustBeValid' });
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body))
		throw new ValidationError({ key: 'errors.jsonBody.requestBodyMust' });
	return body as Record<string, unknown>;
}
