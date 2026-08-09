import { ValidationError } from './errors.js';

/**
 * Small hand-rolled validators.
 *
 * `AGENTS.md` says prefer stdlib over new packages, and the surface we need is
 * narrow enough that a schema library would be more dependency than value.
 * Every validator enforces a bound — no unbounded strings reach the database.
 */

export function str(
	value: unknown,
	field: string,
	opts: { max: number; min?: number; pattern?: RegExp; trim?: boolean }
): string {
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
	const s = opts.trim === false ? value : value.trim();
	const min = opts.min ?? 1;
	if (s.length < min) throw new ValidationError(`${field} is required`);
	if (s.length > opts.max)
		throw new ValidationError(`${field} must be at most ${opts.max} characters`);
	if (opts.pattern && !opts.pattern.test(s)) throw new ValidationError(`${field} is malformed`);
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
		throw new ValidationError(`${field} must be a number`);
	if (opts.int && !Number.isInteger(n)) throw new ValidationError(`${field} must be an integer`);
	if (opts.min !== undefined && n < opts.min)
		throw new ValidationError(`${field} must be at least ${opts.min}`);
	if (opts.max !== undefined && n > opts.max)
		throw new ValidationError(`${field} must be at most ${opts.max}`);
	return n;
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
	if (typeof value !== 'string' || !allowed.includes(value as T))
		throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
	return value as T;
}

/** Parse an ISO-8601 instant and normalise it to UTC with a trailing Z. */
export function isoInstant(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new ValidationError(`${field} must be an ISO-8601 string`);
	const d = new Date(value);
	if (isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid ISO-8601 instant`);
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
