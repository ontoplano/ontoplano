import { fail, type ActionFailure } from '@sveltejs/kit';

/**
 * Typed errors thrown by service functions.
 *
 * Services never import SvelteKit types or return `fail()` — they throw these,
 * and the route/API adapters map them to the right response shape. That's what
 * lets a form action and a JSON endpoint call the same function.
 */

export type ErrorCode =
	| 'validation_error'
	| 'not_found'
	| 'conflict'
	| 'plan_limit'
	| 'payment_required'
	| 'unauthorized'
	| 'forbidden'
	| 'rate_limited'
	| 'internal';

export class ServiceError extends Error {
	readonly code: ErrorCode;
	readonly status: number;
	readonly details?: unknown;

	constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
		super(message);
		this.name = 'ServiceError';
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export class ValidationError extends ServiceError {
	constructor(message: string, details?: unknown) {
		super('validation_error', 422, message, details);
	}
}

/**
 * Thrown both when a resource does not exist and when it belongs to another
 * user. Never distinguish the two — doing so leaks existence.
 */
export class NotFoundError extends ServiceError {
	constructor(what: string) {
		super('not_found', 404, `${what} not found`);
	}
}

export class ConflictError extends ServiceError {
	constructor(message: string) {
		super('conflict', 409, message);
	}
}

export class PlanLimitError extends ServiceError {
	constructor(message: string, details?: unknown) {
		super('plan_limit', 402, message, details);
	}
}

export class UnauthorizedError extends ServiceError {
	constructor(message = 'Authentication required') {
		super('unauthorized', 401, message);
	}
}

/** Allowed, but not this often. 429, and the message says when to come back. */
export class RateLimitedError extends ServiceError {
	constructor(message: string) {
		super('rate_limited', 429, message);
	}
}

export class ForbiddenError extends ServiceError {
	constructor(message = 'Insufficient scope') {
		super('forbidden', 403, message);
	}
}

function toServiceError(e: unknown): ServiceError {
	if (e instanceof ServiceError) return e;
	// Anything else is a bug or an infrastructure failure. Log the detail
	// server-side and tell the caller nothing beyond "500" — error text from
	// the database is not something to hand to an API client.
	console.error('Unexpected service error:', e);
	return new ServiceError('internal', 500, 'Unexpected error');
}

/** Map a thrown service error onto a SvelteKit form-action failure. */
export function toActionFailure(e: unknown): ActionFailure<{ message: string; code: ErrorCode }> {
	const err = toServiceError(e);
	// Form actions historically use 400 for validation; keep that so existing
	// client code that checks `form?.message` behaves the same.
	const status = err.status === 422 ? 400 : err.status;
	return fail(status, { message: err.message, code: err.code });
}

/** Map a thrown service error onto a JSON API response. */
export function toJsonError(e: unknown): Response {
	const err = toServiceError(e);
	return Response.json(
		{ error: { code: err.code, message: err.message, details: err.details } },
		{ status: err.status }
	);
}
