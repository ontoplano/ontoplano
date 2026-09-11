/**
 * A JSON body, read defensively.
 *
 * Everything that accepts JSON goes through this: the size is checked before
 * and after reading, and anything that is not a JSON object is refused with
 * the same sentence everywhere. Portable because it needs nothing but the
 * request itself — a self-contained instance parses its own posts with it.
 */
import { ValidationError } from '$lib/services/errors.js';

const MAX_BODY_BYTES = 256 * 1024;

/** Parse a JSON request body, with a clear error rather than a 500 on bad input. */
export async function readJson(event: { request: Request }): Promise<Record<string, unknown>> {
	const declared = Number(event.request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
		throw new ValidationError('Request body is too large');

	let body: unknown;
	try {
		const text = await event.request.text();
		if (text.length > MAX_BODY_BYTES) throw new ValidationError('Request body is too large');
		body = JSON.parse(text);
	} catch (e) {
		if (e instanceof ValidationError) throw e;
		throw new ValidationError('Request body must be valid JSON');
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body))
		throw new ValidationError('Request body must be a JSON object');
	return body as Record<string, unknown>;
}
