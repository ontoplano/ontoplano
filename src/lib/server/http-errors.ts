import { fail, type ActionFailure } from '@sveltejs/kit';

import { toServiceError, type ErrorCode } from './services/errors.js';

/**
 * A service's refusal, in the shape a route answers with.
 *
 * These two used to live in `services/errors.ts` beside the error classes,
 * which put `@sveltejs/kit` in the import graph of every service — and every
 * service is imported by the scheduled jobs, which run under `tsx` in a
 * directory installed with `yarn install --production`. SvelteKit is a
 * development dependency, so it is not there: the reminders job died on it,
 * having got past the last thing that killed it.
 *
 * Splitting them is also the rule this repository already has. A service does
 * not know what HTTP is; converting its refusal into a status code is the
 * route's job, and now the module boundary says so rather than a paragraph in
 * CONTRIBUTING. `scripts/check-job-deps.mjs` is what keeps it true.
 */

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
