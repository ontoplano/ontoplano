/**
 * Plugin manifests: what a plugin says it understands.
 *
 * Slot metadata accepts any key, which is what lets a plugin define its own
 * vocabulary without a schema change here. The price is anonymity — a list of
 * keys with nothing saying who reads them. A manifest buys the provenance back
 * without closing the vocabulary.
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { pluginManifests } from '../db/schema.js';
import { ValidationError } from './errors.js';
import { META_KEY_PATTERN, MAX_KEY_LENGTH } from './meta.js';

export type PluginMetaKey = {
	key: string;
	description: string;
	example: string;
};

export type PluginManifest = {
	source: string;
	name: string;
	description: string;
	homepage: string;
	metaKeys: PluginMetaKey[];
	updatedAt: string;
};

/** A plugin may not claim more than this many keys. */
export const MAX_PLUGIN_META_KEYS = 40;
const MAX_TEXT = 200;

/** `source` doubles as the stream namespace, so it obeys the same shape. */
export const SOURCE_PATTERN = /^[a-z][a-z0-9_-]*$/;

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
 * Keys must look like metadata keys, because a manifest that describes keys
 * nobody can actually set is worse than no manifest — it documents something
 * that will be rejected on save.
 */
export function parseMetaKeys(input: unknown): PluginMetaKey[] {
	if (input === undefined || input === null) return [];
	if (!Array.isArray(input)) throw new ValidationError('metaKeys must be an array');
	if (input.length > MAX_PLUGIN_META_KEYS)
		throw new ValidationError(`at most ${MAX_PLUGIN_META_KEYS} metadata keys`);

	const seen = new Set<string>();
	return input.map((entry) => {
		if (typeof entry !== 'object' || entry === null)
			throw new ValidationError('each metadata key must be an object');

		const row = entry as Record<string, unknown>;
		const key = text(row.key, 'metaKeys[].key', { required: true }).toLowerCase();

		if (key.length > MAX_KEY_LENGTH)
			throw new ValidationError(
				`metadata key "${key}" is longer than ${MAX_KEY_LENGTH} characters`
			);
		if (!META_KEY_PATTERN.test(key))
			throw new ValidationError(
				`metadata key "${key}" must be lowercase letters, digits and underscores, starting with a letter`
			);
		if (seen.has(key)) throw new ValidationError(`metadata key "${key}" is declared twice`);
		seen.add(key);

		return {
			key,
			description: text(row.description, 'metaKeys[].description'),
			example: text(row.example, 'metaKeys[].example')
		};
	});
}

function shape(row: typeof pluginManifests.$inferSelect): PluginManifest {
	let metaKeys: PluginMetaKey[] = [];
	try {
		const parsed = JSON.parse(row.metaKeys);
		if (Array.isArray(parsed)) metaKeys = parsed as PluginMetaKey[];
	} catch {
		// A manifest that cannot be parsed is treated as declaring nothing rather
		// than breaking every page that lists metadata.
	}

	return {
		source: row.source,
		name: row.name,
		description: row.description ?? '',
		homepage: row.homepage ?? '',
		metaKeys,
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
		metaKeys?: unknown;
	}
): PluginManifest {
	const source = text(input.source, 'source', { required: true }).toLowerCase();
	if (!SOURCE_PATTERN.test(source))
		throw new ValidationError(
			'source must be lowercase letters, digits, hyphens and underscores, starting with a letter'
		);

	const row = {
		userId,
		source,
		name: text(input.name, 'name') || source,
		description: text(input.description, 'description'),
		homepage: text(input.homepage, 'homepage'),
		metaKeys: JSON.stringify(parseMetaKeys(input.metaKeys)),
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

	return shape(
		db
			.select()
			.from(pluginManifests)
			.where(and(eq(pluginManifests.userId, userId), eq(pluginManifests.source, source)))
			.get()!
	);
}

export function deleteManifest(userId: string, source: string): void {
	db.delete(pluginManifests)
		.where(and(eq(pluginManifests.userId, userId), eq(pluginManifests.source, source)))
		.run();
}

/**
 * Which plugin claims each key, for the metadata editor.
 *
 * A key claimed by two plugins lists both — that is real, and hiding one would
 * misrepresent what happens when it is set.
 */
export function metaKeyOwners(
	userId: string
): Map<string, { name: string; entry: PluginMetaKey }[]> {
	const out = new Map<string, { name: string; entry: PluginMetaKey }[]>();
	for (const manifest of listManifests(userId)) {
		for (const entry of manifest.metaKeys) {
			const existing = out.get(entry.key) ?? [];
			existing.push({ name: manifest.name, entry });
			out.set(entry.key, existing);
		}
	}
	return out;
}
