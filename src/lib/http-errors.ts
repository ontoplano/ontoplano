import { fail, type ActionFailure } from '@sveltejs/kit';

import { toServiceError, type ErrorCode, type ServiceError } from '$lib/services/errors.js';
import {
	SOURCE_LOCALE,
	translatorFor,
	type Locale,
	type MessageKey,
	type MessageValues
} from '$lib/i18n/core.js';

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

/**
 * Who is being answered, asked at the moment of answering.
 *
 * This module is bundled for the device as well as for the server: the
 * isolated instance runs the route files in a worker, which is where they are
 * globbed from, so anything here that reached for `$app/server` would fail the
 * build rather than merely go unused. And a module-level *locale* would be
 * worse than either — a server answers many people at once, and one request's
 * language leaking into another's page is the bug this whole file exists
 * downstream of.
 *
 * So what is held is a way of asking, bound once by whichever side is running:
 * `hooks.server.ts` binds the request's own, and anything that does not bind
 * gets the source language. Asked per call, inside the request, so concurrent
 * requests each get their own answer.
 */
let askLocale: () => Locale = () => SOURCE_LOCALE;

export function bindRefusalLocale(source: () => Locale): void {
	askLocale = source;
}

/**
 * The refusal, in the language of whoever is being refused.
 *
 * A service throws a key; here is where it becomes a sentence, because here is
 * the first place that knows whose request is being answered. An error still
 * carrying a plain sentence is left as it is.
 */
async function said(err: ServiceError): Promise<string> {
	if (!err.key) return err.message;
	// Before the await: some environments can only answer this synchronously,
	// inside the call that started the request.
	const locale = askLocale();
	// The generated signature pairs each key with its own placeholders, which a
	// key held in a variable cannot satisfy. `useT` widens it the same way.
	const t = (await translatorFor(locale)) as (key: MessageKey, values?: MessageValues) => string;
	return t(err.key, err.values);
}

/** Map a thrown service error onto a SvelteKit form-action failure. */
export async function toActionFailure(
	e: unknown
): Promise<ActionFailure<{ message: string; code: ErrorCode }>> {
	const err = toServiceError(e);
	// Form actions historically use 400 for validation; keep that so existing
	// client code that checks `form?.message` behaves the same.
	const status = err.status === 422 ? 400 : err.status;
	return fail(status, { message: await said(err), code: err.code });
}

/** Map a thrown service error onto a JSON API response. */
export async function toJsonError(e: unknown): Promise<Response> {
	const err = toServiceError(e);
	return Response.json(
		{ error: { code: err.code, message: await said(err), details: err.details } },
		{ status: err.status }
	);
}
