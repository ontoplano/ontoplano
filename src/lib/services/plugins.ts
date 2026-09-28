/**
 * Plugin manifests: what a plugin says it understands.
 *
 * A task's attributes accept any key, which is what lets a plugin define its own
 * vocabulary without a schema change here. The price is anonymity — a list of
 * keys with nothing saying who reads them. A manifest buys the provenance back
 * without closing the vocabulary.
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { pluginManifests } from '$lib/db/schema.js';
import { ValidationError } from '$lib/services/errors.js';
import {
	ATTRIBUTE_KEY_PATTERN,
	MAX_KEY_LENGTH,
	META_REMOVED_IN
} from '$lib/services/task-attributes.js';

export type PluginAttributeKey = {
	key: string;
	description: string;
	example: string;
};

export type PluginManifest = {
	source: string;
	name: string;
	description: string;
	homepage: string;
	attributeKeys: PluginAttributeKey[];
	/** The same list under its old name, answered until `META_REMOVED_IN`. */
	metaKeys: PluginAttributeKey[];
	updatedAt: string;
};

/** A plugin may not claim more than this many keys. */
export const MAX_PLUGIN_ATTRIBUTE_KEYS = 40;
const MAX_TEXT = 200;

/** `source` doubles as the stream namespace, so it obeys the same shape. */
export const SOURCE_PATTERN = /^[a-z][a-z0-9_-]*$/;

/**
 * A plugin's homepage, if it gives one: an ordinary web address or nothing.
 *
 * Stored as free text once, which is a loaded gun — `javascript:` and `data:`
 * are strings too, and the first screen that draws this as a link would be an
 * XSS. Nothing renders it today; the check belongs here rather than in
 * whatever renders it first.
 */
function webAddress(value: unknown): string {
	const raw = text(value, 'homepage');
	if (!raw) return '';
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new ValidationError({ key: 'errors.plugins.homepageMustBeAWeb' });
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:')
		throw new ValidationError({ key: 'errors.plugins.homepageMustBeAnHttp' });
	return url.toString();
}

function text(value: unknown, field: string, { required = false } = {}): string {
	if (value === undefined || value === null) {
		if (required) throw new ValidationError(`${field} is required`);
		return '';
	}
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
	const trimmed = value.trim();
	if (required && !trimmed) throw new ValidationError(`${field} is required`);
	if (trimmed.length > MAX_TEXT)
		throw new ValidationError(`${field} is longer than ${MAX_TEXT} characters`);
	return trimmed;
}

/**
 * Validate a declared vocabulary.
 *
 * Keys must look like attribute names, because a manifest that describes keys
 * nobody can actually set is worse than no manifest — it documents something
 * that will be rejected on save.
 */
export function parseAttributeKeys(input: unknown): PluginAttributeKey[] {
	if (input === undefined || input === null) return [];
	if (!Array.isArray(input))
		throw new ValidationError({ key: 'errors.plugins.attributeKeysMustBeAnArray' });
	if (input.length > MAX_PLUGIN_ATTRIBUTE_KEYS)
		throw new ValidationError(`at most ${MAX_PLUGIN_ATTRIBUTE_KEYS} attribute keys`);

	const seen = new Set<string>();
	return input.map((entry) => {
		if (typeof entry !== 'object' || entry === null)
			throw new ValidationError({ key: 'errors.plugins.eachAttributeKeyMust' });

		const row = entry as Record<string, unknown>;
		const key = text(row.key, 'attributeKeys[].key', { required: true }).toLowerCase();

		if (key.length > MAX_KEY_LENGTH)
			throw new ValidationError(
				`attribute key "${key}" is longer than ${MAX_KEY_LENGTH} characters`
			);
		if (!ATTRIBUTE_KEY_PATTERN.test(key))
			throw new ValidationError(
				`attribute key "${key}" must be lowercase letters, digits and underscores, starting with a letter`
			);
		if (seen.has(key)) throw new ValidationError(`attribute key "${key}" is declared twice`);
		seen.add(key);

		return {
			key,
			description: text(row.description, 'attributeKeys[].description'),
			example: text(row.example, 'attributeKeys[].example')
		};
	});
}

function shape(row: typeof pluginManifests.$inferSelect): PluginManifest {
	let attributeKeys: PluginAttributeKey[] = [];
	try {
		const parsed = JSON.parse(row.metaKeys);
		// Read leniently: a bare name is a key with nothing said about it, and
		// anything else is left out rather than breaking the editor that lists
		// them — the write path is where the shape is enforced.
		if (Array.isArray(parsed))
			attributeKeys = parsed.flatMap((entry): PluginAttributeKey[] =>
				typeof entry === 'string'
					? [{ key: entry, description: '', example: '' }]
					: entry && typeof entry === 'object' && typeof entry.key === 'string'
						? [
								{
									key: entry.key,
									description: String(entry.description ?? ''),
									example: String(entry.example ?? '')
								}
							]
						: []
			);
	} catch {
		// A manifest that cannot be parsed is treated as declaring nothing rather
		// than breaking every page that lists attributes.
	}

	return {
		source: row.source,
		name: row.name,
		description: row.description ?? '',
		homepage: row.homepage ?? '',
		attributeKeys,
		metaKeys: attributeKeys,
		updatedAt: row.updatedAt
	};
}

export function listManifests(userId: string): PluginManifest[] {
	return db
		.select()
		.from(pluginManifests)
		.where(eq(pluginManifests.userId, userId))
		.orderBy(asc(pluginManifests.name))
		.all()
		.map(shape);
}

/**
 * Record what a plugin declares, replacing whatever it declared before.
 *
 * Replace rather than merge: a plugin that stops using a key should be able to
 * drop it, and the manifest it sends is the whole truth about that version.
 */
export function upsertManifest(
	userId: string,
	input: {
		source: string;
		name?: unknown;
		description?: unknown;
		homepage?: unknown;
		attributeKeys?: unknown;
		/** The old name for `attributeKeys`, read until `META_REMOVED_IN`. */
		metaKeys?: unknown;
	}
): PluginManifest & { warning?: string } {
	const source = text(input.source, 'source', { required: true }).toLowerCase();
	if (!SOURCE_PATTERN.test(source))
		throw new ValidationError({ key: 'errors.plugins.sourceMustBeLowercaseLetters' });

	const row = {
		userId,
		source,
		name: text(input.name, 'name') || source,
		description: text(input.description, 'description'),
		homepage: webAddress(input.homepage),
		// The column keeps its old name; only the words around it moved.
		metaKeys: JSON.stringify(parseAttributeKeys(input.attributeKeys ?? input.metaKeys)),
		updatedAt: new Date().toISOString()
	};

	const existing = db
		.select({ id: pluginManifests.id })
		.from(pluginManifests)
		.where(and(eq(pluginManifests.userId, userId), eq(pluginManifests.source, source)))
		.get();

	if (existing) {
		db.update(pluginManifests).set(row).where(eq(pluginManifests.id, existing.id)).run();
	} else {
		db.insert(pluginManifests).values(row).run();
	}

	const saved = shape(
		db
			.select()
			.from(pluginManifests)
			.where(and(eq(pluginManifests.userId, userId), eq(pluginManifests.source, source)))
			.get()!
	);
	// Said in the answer, because a plugin that is only ever told "200" goes on
	// sending the old name right up to the release that stops reading it.
	return input.attributeKeys === undefined && input.metaKeys !== undefined
		? { ...saved, warning: META_KEYS_WARNING }
		: saved;
}

/** What a manifest still sending `metaKeys` is told. */
export const META_KEYS_WARNING =
	`\`metaKeys\` is deprecated and will be removed in ${META_REMOVED_IN}. ` +
	'Send the same list as `attributeKeys`. This manifest was read anyway.';

export function deleteManifest(userId: string, source: string): void {
	db.delete(pluginManifests)
		.where(and(eq(pluginManifests.userId, userId), eq(pluginManifests.source, source)))
		.run();
}

/**
 * Which plugin claims each key, for the attributes editor.
 *
 * A key claimed by two plugins lists both — that is real, and hiding one would
 * misrepresent what happens when it is set.
 */
export function attributeKeyOwners(
	userId: string
): Map<string, { name: string; entry: PluginAttributeKey }[]> {
	const out = new Map<string, { name: string; entry: PluginAttributeKey }[]>();
	for (const manifest of listManifests(userId)) {
		for (const entry of manifest.attributeKeys) {
			const existing = out.get(entry.key) ?? [];
			existing.push({ name: manifest.name, entry });
			out.set(entry.key, existing);
		}
	}
	return out;
}
