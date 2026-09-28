import { ValidationError } from './errors.js';
import { ATTRIBUTE_FORM } from '../attribute-keys.js';

export { ATTRIBUTE_FORM };

/**
 * A task's attributes: user-defined key/value pairs on a task block or a todo.
 *
 * Ontoplano stores these and never interprets them. Plugins read them from the
 * schedule API and decide what they mean — `alarm: true` and `remind_min: 5`
 * make an alarm app ring five minutes early, and a future ontoplano app can act
 * on the same pairs without a schema change.
 *
 * The same idea as an inventory item's attributes, with a stricter key: a
 * plugin reads these by name, so a key is an identifier rather than a word —
 * `remind_min`, never `Remind min` — and a typo like `remind_mins` is at least
 * refused in the same shape every time. Flat string→string, validated keys,
 * hard caps: an unbounded blob turns into a dumping ground.
 *
 * Called `meta` until 0.184; the schedule API and the plugin manifest still
 * answer to the old names until `META_REMOVED_IN`.
 */

export const MAX_ATTRIBUTE_PAIRS = 20;
export const MAX_KEY_LENGTH = 40;
export const MAX_VALUE_LENGTH = 200;

/** The release that stops answering to `meta` and `metaKeys`. */
export const META_REMOVED_IN = '0.190.0';

/** Lowercase identifier: letters, digits, underscore; must start with a letter. */
export const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export type TaskAttributes = Record<string, string>;

// Suggested keys for the editor UI live in `$lib/attribute-keys` so the client
// can import them without pulling in server code.

export function parseAttributes(raw: string | null | undefined): TaskAttributes {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const out: TaskAttributes = {};
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
 * Validate and serialise attributes for storage.
 *
 * Accepts a plain object, or a JSON string of one.
 */
export function serialiseAttributes(input: unknown): string {
	if (input === undefined || input === null || input === '') return '{}';

	let entries: [string, unknown][];
	if (typeof input === 'string') {
		entries = Object.entries(parseAttributes(input));
	} else if (typeof input === 'object' && !Array.isArray(input)) {
		entries = Object.entries(input as Record<string, unknown>);
	} else {
		throw new ValidationError({ key: 'errors.attributes.mustBeAnObject' });
	}

	const out: TaskAttributes = {};
	for (const [rawKey, rawValue] of entries) {
		const key = rawKey.trim().toLowerCase();
		if (!key) continue;

		if (key.length > MAX_KEY_LENGTH)
			throw new ValidationError(
				`attribute "${key}" has a name longer than ${MAX_KEY_LENGTH} characters`
			);
		if (!ATTRIBUTE_KEY_PATTERN.test(key))
			throw new ValidationError(
				`attribute "${key}" must be named with lowercase letters, digits and underscores, starting with a letter`
			);

		if (rawValue === undefined || rawValue === null) continue;
		const value =
			typeof rawValue === 'string'
				? rawValue.trim()
				: typeof rawValue === 'number' || typeof rawValue === 'boolean'
					? String(rawValue)
					: null;
		if (value === null) throw new ValidationError(`attribute "${key}" must be a string`);
		if (value === '') continue; // an empty value means "remove this key"
		if (value.length > MAX_VALUE_LENGTH)
			throw new ValidationError(`attribute "${key}" is longer than ${MAX_VALUE_LENGTH} characters`);

		out[key] = value;
	}

	const count = Object.keys(out).length;
	if (count > MAX_ATTRIBUTE_PAIRS)
		throw new ValidationError(`at most ${MAX_ATTRIBUTE_PAIRS} attributes (got ${count})`);

	return JSON.stringify(out);
}

/**
 * One attribute set, changed or removed, the rest left as they were.
 *
 * What the ⓘ dialog's pencil posts: one pair, not the whole set, so editing a
 * value cannot drop a key somebody else wrote in the meantime. An empty value
 * removes the key, the same rule as everywhere else.
 */
export function withAttribute(stored: string | null | undefined, key: unknown, value: unknown) {
	return serialiseAttributes({ ...parseAttributes(stored), [String(key ?? '')]: value ?? '' });
}

/**
 * Attributes from parallel form fields.
 *
 * Forms submit `attributeKey` and `attributeValue` as ordered parallel lists,
 * which is the shape a repeatable key/value editor produces.
 */
export function attributesFromFormData(formData: {
	getAll: (name: string) => FormDataEntryValue[];
}): string {
	const keys = formData.getAll(ATTRIBUTE_FORM.key).map((v) => String(v));
	const values = formData.getAll(ATTRIBUTE_FORM.value).map((v) => String(v));
	if (keys.length === 0) return '{}';

	const obj: Record<string, string> = {};
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i]?.trim();
		if (!k) continue;
		obj[k] = values[i] ?? '';
	}
	return serialiseAttributes(obj);
}

/**
 * Attributes for an update, distinguishing "not submitted" from "cleared".
 *
 * Drag and resize in the grid post to the same update action with only the
 * placement fields. Those requests must leave attributes alone — returning
 * `{}` would silently wipe a block's alarm settings every time it was moved. A
 * form that genuinely clears the last pair still carries the editor's
 * `attributesPresent` marker, and so reads as an explicit `{}`.
 */
export function attributesPatchFromFormData(formData: {
	has: (name: string) => boolean;
	getAll: (name: string) => FormDataEntryValue[];
}): string | undefined {
	if (!formData.has(ATTRIBUTE_FORM.key) && !formData.has(ATTRIBUTE_FORM.present)) return undefined;
	return attributesFromFormData(formData);
}

/**
 * The attributes an API or MCP caller sent, from the current spelling or the
 * old one, and whether the old one was used.
 *
 * `attributes` wins when both are given. Undefined means neither was sent,
 * which an update reads as "leave them alone".
 */
export function attributesArg(args: { attributes?: unknown; meta?: unknown }): {
	value: unknown;
	usedMeta: boolean;
} {
	if (args.attributes !== undefined) return { value: args.attributes, usedMeta: false };
	if (args.meta !== undefined) return { value: args.meta, usedMeta: true };
	return { value: undefined, usedMeta: false };
}

/** What an answer says to a caller still using `meta`. */
export const META_WARNING =
	`\`meta\` is deprecated and will be removed in ${META_REMOVED_IN}. ` +
	'It is called `attributes` now: send and read that instead. This call was translated.';
