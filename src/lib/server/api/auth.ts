import type { RequestEvent } from '@sveltejs/kit';

import { paymentHoldFor } from '../services/access.js';
import { buildCtx, type Ctx } from '../services/ctx.js';
import {
	RateLimitedError,
	ServiceError,
	UnauthorizedError,
	ValidationError
} from '../services/errors.js';
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

/**
 * And above the tokens, the account.
 *
 * The per-token budget multiplies: twenty tokens at 240 reads a minute is
 * 4,800, all billed to one account and one disk. This ceiling is what the
 * account may do in total, however many keys it cuts — generous enough that
 * no honest set of producers meets it.
 */
const ACCOUNT_READ_LIMIT = 600;
const ACCOUNT_WRITE_LIMIT = 150;

function isWrite(method: string): boolean {
	return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

/**
 * One call against the token's and the account's budget, or a refusal.
 *
 * Shared with the MCP server, which is the same token knocking on a different
 * door: an assistant asked to "create 1000 goals" spends this budget one
 * write at a time and is told to slow down, exactly as a plugin would be.
 */
export function spendCallBudget(tokenId: number, userId: string, write: boolean): void {
	const perToken = rateLimit(
		`api:${tokenId}:${write ? 'w' : 'r'}`,
		write ? WRITE_LIMIT : READ_LIMIT,
		WINDOW_MS
	);
	const perAccount = rateLimit(
		`api:acct:${userId}:${write ? 'w' : 'r'}`,
		write ? ACCOUNT_WRITE_LIMIT : ACCOUNT_READ_LIMIT,
		WINDOW_MS
	);

	if (!perToken.allowed || !perAccount.allowed) {
		const retryAfterSeconds = Math.max(perToken.retryAfterSeconds, perAccount.retryAfterSeconds);
		throw new RateLimitedError(`Too many requests. Try again in ${retryAfterSeconds} seconds.`);
	}
}

/**
 * Authenticate an API request and check its scope.
 *
 * Two ways in:
 *  - `Authorization: Bearer onto_…` — external producers (scripts, phone apps)
 *  - an active session cookie — the app's own frontend, which holds every scope
 *
 * Both resolve to the same `Ctx`, so handlers never care which was used.
 *
 * `holds` answers "was this caller granted that as well", for a handler whose
 * answer has optional parts — today's board includes habits only for a token
 * that asked for them. A session holds everything, because it is the person
 * themselves in their own browser.
 */
export function authenticateApi(
	event: RequestEvent,
	scope: Scope
): { ctx: Ctx; via: 'token' | 'session'; holds: (scope: Scope) => boolean } {
	const header = event.request.headers.get('authorization') ?? '';
	const now = new Date();

	if (header.toLowerCase().startsWith('bearer ')) {
		const token = authenticateToken(header.slice(7).trim(), now);
		requireScope(token, scope);

		spendCallBudget(token.tokenId, token.userId, isWrite(event.request.method));

		assertNoPaymentHold(token.userId);
		return {
			ctx: buildCtx(token.userId, { now }),
			via: 'token',
			holds: (wanted) => token.scopes.includes(wanted)
		};
	}

	if (event.locals.user) {
		assertNoPaymentHold(event.locals.user.id);
		return { ctx: buildCtx(event.locals.user.id, { now }), via: 'session', holds: () => true };
	}

	throw new UnauthorizedError('Provide a bearer token or sign in');
}

/**
 * The account's payment holds apply to its plugins too.
 *
 * Decided in services/access.ts, same as the page gate — a token is the
 * account, and an expired account does not keep producing through a side
 * door. 402, so a producer can tell "renew" apart from "bad token".
 */
export function assertNoPaymentHold(userId: string): void {
	const hold = paymentHoldFor(userId);
	if (hold === 'expired')
		throw new ServiceError(
			'payment_required',
			402,
			'The subscription has ended — renew to keep using the API'
		);
	if (hold === 'billing')
		throw new ServiceError(
			'payment_required',
			402,
			'The account has not finished setting up billing'
		);
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
