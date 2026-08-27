import type { RequestEvent } from '@sveltejs/kit';

import { buildCtx, type Ctx } from '../services/ctx.js';
import { RateLimitedError, UnauthorizedError, ValidationError } from '../services/errors.js';
import { rateLimit } from '../rate-limit.js';
import { authenticateToken, requireScope, type Scope } from '../services/tokens.js';

/**
 * How often one caller may knock.
 *
 * Per token rather than per address: a plugin lives on a phone behind carrier
 * NAT, so addresses are shared and mobile, while a token is exactly one
 * producer belonging to exactly one account. That also means an abusive plugin
 * throttles itself and nobody else — which is the property that matters on a
 * shared server.
 *
 * Reads are cheap and pollers are legitimate; writes hit the disk and grow the
 * database, so they get a tighter budget. Neither is a defence against a real
 * distributed flood — that is the proxy's job, and nothing inside the process
 * can help once the process is the thing being drowned. This is the defence
 * against the ordinary case: one misconfigured or malicious producer.
 */
const READ_LIMIT = 240;
const WRITE_LIMIT = 60;
const WINDOW_MS = 60_000;

function isWrite(method: string): boolean {
	return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

/**
 * Authenticate an API request and check its scope.
 *
 * Two ways in:
 *  - `Authorization: Bearer onto_…` — external producers (a-private-plugin, scripts)
 *  - an active session cookie — the app's own frontend, which holds every scope
 *
 * Both resolve to the same `Ctx`, so handlers never care which was used.
 */
export function authenticateApi(
	event: RequestEvent,
	scope: Scope
): { ctx: Ctx; via: 'token' | 'session' } {
	const header = event.request.headers.get('authorization') ?? '';
	const now = new Date();

	if (header.toLowerCase().startsWith('bearer ')) {
		const token = authenticateToken(header.slice(7).trim(), now);
		requireScope(token, scope);

		const write = isWrite(event.request.method);
		const { allowed, retryAfterSeconds } = rateLimit(
			`api:${token.tokenId}:${write ? 'w' : 'r'}`,
			write ? WRITE_LIMIT : READ_LIMIT,
			WINDOW_MS
		);

		if (!allowed)
			throw new RateLimitedError(`Too many requests. Try again in ${retryAfterSeconds} seconds.`);

		return { ctx: buildCtx(token.userId, { now }), via: 'token' };
	}

	if (event.locals.user) {
		return { ctx: buildCtx(event.locals.user.id, { now }), via: 'session' };
	}

	throw new UnauthorizedError('Provide a bearer token or sign in');
}

/**
 * The largest body this API will read.
 *
 * A point is a number and a timestamp; a megabyte of them is a mistake or an
 * attack, and either way parsing it first and refusing afterwards is the wrong
 * order. Checked against the declared length before anything is read, so a
 * lying header is caught by the parse and an honest one costs nothing.
 */
const MAX_BODY_BYTES = 256 * 1024;

/** Parse a JSON request body, with a clear error rather than a 500 on bad input. */
export async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
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
