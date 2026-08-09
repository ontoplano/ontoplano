import type { RequestEvent } from '@sveltejs/kit';

import { buildCtx, type Ctx } from '../services/ctx.js';
import { UnauthorizedError, ValidationError } from '../services/errors.js';
import { authenticateToken, requireScope, type Scope } from '../services/tokens.js';

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
		return { ctx: buildCtx(token.userId, { now }), via: 'token' };
	}

	if (event.locals.user) {
		return { ctx: buildCtx(event.locals.user.id, { now }), via: 'session' };
	}

	throw new UnauthorizedError('Provide a bearer token or sign in');
}

/** Parse a JSON request body, with a clear error rather than a 500 on bad input. */
export async function readJson(event: RequestEvent): Promise<Record<string, unknown>> {
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		throw new ValidationError('Request body must be valid JSON');
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body))
		throw new ValidationError('Request body must be a JSON object');
	return body as Record<string, unknown>;
}
