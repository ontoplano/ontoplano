import { ValidationError } from './errors.js';

/**
 * User-defined key/value metadata attached to planner slots.
 *
 * Ontoplano stores these and never interprets them. Plugins read them from the
 * schedule API and decide what they mean — `alarm: true` and `remind_min: 5`
 * make a-private-plugin ring five minutes early, and a future ontoplano app can act
 * on the same pairs without a schema change.
 *
 * Deliberately constrained rather than free-form JSON: an unbounded blob turns
 * into a dumping ground, and a typo like `remind_mins` would silently do
 * nothing forever. Flat string→string, validated keys, hard caps.
 */

export const MAX_META_PAIRS = 20;
export const MAX_KEY_LENGTH = 40;
export const MAX_VALUE_LENGTH = 200;

/** Lowercase identifier: letters, digits, underscore; must start with a letter. */
export const META_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export type SlotMeta = Record<string, string>;

// Suggested keys for the editor UI live in `$lib/meta-keys` so the client can
// import them without pulling in server code.

export function parseMeta(raw: string | null | undefined): SlotMeta {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const out: SlotMeta = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (typeof v === 'string') out[k] = v;
			else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
		}
		return out;
	} catch {
		return {};
	}
}

/**
 * Validate and serialise a metadata object for storage.
 *
 * Accepts either a plain object or the paired `metaKey[]` / `metaValue[]` form
 * a form submission produces.
 */
export function serialiseMeta(input: unknown): string {
	if (input === undefined || input === null || input === '') return '{}';

	let entries: [string, unknown][];
	if (typeof input === 'string') {
		entries = Object.entries(parseMeta(input));
	} else if (typeof input === 'object' && !Array.isArray(input)) {
		entries = Object.entries(input as Record<string, unknown>);
	} else {
		throw new ValidationError('metadata must be an object');
	}

	const out: SlotMeta = {};
	for (const [rawKey, rawValue] of entries) {
		const key = rawKey.trim().toLowerCase();
		if (!key) continue;

		if (key.length > MAX_KEY_LENGTH)
			throw new ValidationError(`metadata key "${key}" is longer than ${MAX_KEY_LENGTH} characters`);
		if (!META_KEY_PATTERN.test(key))
			throw new ValidationError(
				`metadata key "${key}" must be lowercase letters, digits and underscores, starting with a letter`
			);

		if (rawValue === undefined || rawValue === null) continue;
		const value =
			typeof rawValue === 'string'
				? rawValue.trim()
				: typeof rawValue === 'number' || typeof rawValue === 'boolean'
					? String(rawValue)
					: null;
		if (value === null) throw new ValidationError(`metadata value for "${key}" must be a string`);
		if (value === '') continue; // an empty value means "remove this key"
		if (value.length > MAX_VALUE_LENGTH)
			throw new ValidationError(
				`metadata value for "${key}" is longer than ${MAX_VALUE_LENGTH} characters`
			);

		out[key] = value;
	}

	const count = Object.keys(out).length;
	if (count > MAX_META_PAIRS)
		throw new ValidationError(`at most ${MAX_META_PAIRS} metadata pairs (got ${count})`);

	return JSON.stringify(out);
}

/**
 * Build a metadata object from parallel form fields.
 *
 * Forms submit `metaKey` and `metaValue` as ordered parallel lists, which is
 * the shape a repeatable key/value editor produces.
 */
export function metaFromFormData(formData: {
	getAll: (name: string) => FormDataEntryValue[];
}): string {
	const keys = formData.getAll('metaKey').map((v) => String(v));
	const values = formData.getAll('metaValue').map((v) => String(v));
	if (keys.length === 0) return '{}';

	const obj: Record<string, string> = {};
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i]?.trim();
		if (!k) continue;
		obj[k] = values[i] ?? '';
	}
	return serialiseMeta(obj);
}

/**
 * Metadata patch for an update, distinguishing "not submitted" from "cleared".
 *
 * Drag and resize in the grid post to the same update action with only the
 * placement fields. Those requests must leave metadata alone — returning `{}`
 * would silently wipe a slot's alarm settings every time it was moved. A form
 * that genuinely clears the last pair submits an empty `metaKey`, which is
 * still present in the payload and so reads as an explicit `{}`.
 */
export function metaPatchFromFormData(formData: {
	has: (name: string) => boolean;
	getAll: (name: string) => FormDataEntryValue[];
}): string | undefined {
	if (!formData.has('metaKey') && !formData.has('metaPresent')) return undefined;
	return metaFromFormData(formData);
}
