/**
 * Typed errors thrown by service functions.
 *
 * Services never import SvelteKit types or return `fail()` — they throw these,
 * and the route/API adapters map them to the right response shape. That's what
 * lets a form action and a JSON endpoint call the same function.
 *
 * **A refusal is a message key, not a sentence.** These reach a person: a form
 * action puts one in `form.message` and the screen shows it. Written as English
 * in the source, an account set to Portuguese got its screens translated and
 * its refusals in English — which is worse than an untranslated screen, because
 * a refusal is read at exactly the moment somebody is stuck.
 *
 * So a thrown error carries the key and the values, and the adapter that turns
 * it into a response is what translates, in the language of the request it is
 * answering. A plain string is still accepted: a few of these are read by
 * software rather than by a person.
 */
import type { MessageKey, MessageValues } from '$lib/i18n/core.js';

/**
 * What an error says: a key to look up, or a sentence nobody will translate.
 *
 * The object form carries its own values, so a message with a number or a name
 * in it reads as one sentence in every language rather than a stem with
 * something appended.
 */
export type Said =
	| string
	| {
			key: MessageKey;
			values?: MessageValues;
			/**
			 * The sentence a log line and an API client see, where the key alone
			 * would be unhelpful. `not found` is the one that matters: the API has
			 * always answered "todo not found", and a key is not that.
			 */
			text?: string;
	  };

/** The key half of whatever was said, if there is one. */
function keyOf(said: Said): { key?: MessageKey; values?: MessageValues } {
	return typeof said === 'string' ? {} : { key: said.key, values: said.values };
}

/**
 * The string an error carries as its `message`.
 *
 * For a key this is the key itself, which is what a log line and a stack trace
 * get. Nobody reads it out to a person — the adapters translate — and a key in
 * a log is more useful than a sentence in the wrong language anyway.
 */
function textOf(said: Said): string {
	return typeof said === 'string' ? said : (said.text ?? said.key);
}

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
	/** The catalogue entry to read this out of, where there is one. */
	readonly key?: MessageKey;
	readonly values?: MessageValues;

	constructor(code: ErrorCode, status: number, said: Said, details?: unknown) {
		super(textOf(said));
		this.name = 'ServiceError';
		this.code = code;
		this.status = status;
		this.details = details;
		const { key, values } = keyOf(said);
		this.key = key;
		this.values = values;
	}
}

export class ValidationError extends ServiceError {
	constructor(said: Said, details?: unknown) {
		super('validation_error', 422, said, details);
	}
}

/**
 * Thrown both when a resource does not exist and when it belongs to another
 * user. Never distinguish the two — doing so leaks existence.
 *
 * A plain string is the *kind* of thing, in English — `'todo'`, `'seat'` — and
 * nobody is ever shown it: it is what the log line and the API's `message`
 * carry, while a person reads one flat sentence that names nothing, which is
 * what not leaking existence means. A key is for the few refusals that have
 * something to say beyond "no": that the invitation was already answered, that
 * the failure has been dealt with.
 *
 * Both were spelled the same way before, and the sentences lost: the API read
 * back "That failure is gone — resolved or dismissed already not found".
 */
export class NotFoundError extends ServiceError {
	constructor(said: Said) {
		super(
			'not_found',
			404,
			typeof said === 'string' ? { key: 'errors.notFound', text: `${said} not found` } : said
		);
	}
}

export class ConflictError extends ServiceError {
	constructor(said: Said) {
		super('conflict', 409, said);
	}
}

export class PlanLimitError extends ServiceError {
	constructor(said: Said, details?: unknown) {
		super('plan_limit', 402, said, details);
	}
}

export class UnauthorizedError extends ServiceError {
	constructor(said: Said = { key: 'errors.authenticationRequired' }) {
		super('unauthorized', 401, said);
	}
}

/** Allowed, but not this often. 429, and the message says when to come back. */
export class RateLimitedError extends ServiceError {
	constructor(said: Said) {
		super('rate_limited', 429, said);
	}
}

export class ForbiddenError extends ServiceError {
	constructor(said: Said = { key: 'errors.insufficientScope' }) {
		super('forbidden', 403, said);
	}
}

export function toServiceError(e: unknown): ServiceError {
	if (e instanceof ServiceError) return e;
	// Anything else is a bug or an infrastructure failure. Log the detail
	// server-side and tell the caller nothing beyond "500" — error text from
	// the database is not something to hand to an API client.
	console.error('Unexpected service error:', e);
	return new ServiceError('internal', 500, { key: 'errors.unexpected' });
}
