import { ValidationError } from './errors.js';

/**
 * Small hand-rolled validators.
 *
 * `AGENTS.md` says prefer stdlib over new packages, and the surface we need is
 * narrow enough that a schema library would be more dependency than value.
 * Every validator enforces a bound — no unbounded strings reach the database.
 */

/**
 * The field name, at the start of a sentence.
 *
 * Callers pass what the field is called on screen — `target`, `first day` —
 * so the message reads as English rather than as a variable name.
 */
function Field(field: string): string {
	return field.charAt(0).toUpperCase() + field.slice(1);
}

export function str(
	value: unknown,
	field: string,
	opts: { max: number; min?: number; pattern?: RegExp; trim?: boolean }
): string {
	// A non-string only arrives from a form that did not send the field at all,
	// which to the person filling it in is the same as leaving it empty.
	if (typeof value !== 'string') throw new ValidationError(`${Field(field)} is required`);
	const s = opts.trim === false ? value : value.trim();
	const min = opts.min ?? 1;
	if (s.length < min) throw new ValidationError(`${Field(field)} is required`);
	if (s.length > opts.max)
		throw new ValidationError(`${Field(field)} has to be ${opts.max} characters or fewer`);
	if (opts.pattern && !opts.pattern.test(s))
		// Say what is wrong with the value, not that we failed to understand it.
		throw new ValidationError(`That ${field} is not in a shape this accepts`);
	return s;
}

export function optionalStr(
	value: unknown,
	field: string,
	opts: { max: number; pattern?: RegExp }
): string {
	if (value === undefined || value === null || value === '') return '';
	return str(value, field, { ...opts, min: 0 });
}

export function num(
	value: unknown,
	field: string,
	opts: { min?: number; max?: number; int?: boolean } = {}
): number {
	const n = typeof value === 'string' ? Number(value) : value;
	if (typeof n !== 'number' || !Number.isFinite(n))
		throw new ValidationError(`${Field(field)} has to be a number`);
	if (opts.int && !Number.isInteger(n))
		throw new ValidationError(`${Field(field)} has to be a whole number`);
	if (opts.min !== undefined && n < opts.min) {
		// A minimum below one is a way of saying "not zero, not negative", and
		// printing it gave "target must be at least 0.000001".
		throw new ValidationError(
			opts.min > 0 && opts.min < 1
				? `${Field(field)} has to be more than zero`
				: `${Field(field)} has to be ${opts.min} or more`
		);
	}
	if (opts.max !== undefined && n > opts.max)
		throw new ValidationError(`${Field(field)} has to be ${opts.max} or less`);
	return n;
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
	// The allowed values are the database's words, not the reader's, so they
	// stay out of the message.
	if (typeof value !== 'string' || !allowed.includes(value as T))
		throw new ValidationError(`${Field(field)} is not one of the choices`);
	return value as T;
}

/** Parse an ISO-8601 instant and normalise it to UTC with a trailing Z. */
export function isoInstant(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new ValidationError(`${Field(field)} has to be a time`);
	const d = new Date(value);
	if (isNaN(d.getTime())) throw new ValidationError(`${Field(field)} is not a time this can read`);
	return d.toISOString();
}

/** Validate that a value is a JSON object and serialise it within a size cap. */
export function jsonObject(value: unknown, field: string, maxBytes: number): string {
	if (value === undefined || value === null) return '{}';
	if (typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError(`${field} must be a JSON object`);
	const s = JSON.stringify(value);
	if (s.length > maxBytes)
		throw new ValidationError(`${field} must be at most ${maxBytes} bytes when serialised`);
	return s;
}

/**
 * Stream slugs are used in URLs and namespaced by producer, e.g.
 * `a-private-plugin.weight`. Lowercase, dot-separated segments.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/;

export function slug(value: unknown, field: string): string {
	return str(value, field, { max: 64, pattern: SLUG_PATTERN });
}
