import { TOOLS } from './tools.js';

/**
 * The tool surface as a shape, for the snapshot beside it.
 *
 * MCP has no schema-compatibility story of its own: tool names, parameter
 * names and enums are just JSON handed to the client at connect time, so a
 * renamed parameter breaks a self-hoster's saved prompts at call time, not at
 * upgrade time — and never in this repo's own tests, because the caller is a
 * model rather than a fixture. `manifest.json` is the committed snapshot of
 * that surface, and `tests/mcp-manifest.test.ts` diffs it on every run:
 *
 * - **removing** a tool or a parameter, making a parameter **required**,
 *   dropping an **enum value**, tightening a **bound**, changing a
 *   **default**, or changing what a tool needs to be called is refused
 *   outright — unless the thing was marked `deprecated` in the committed
 *   manifest, i.e. the warning shipped in an earlier release, and the
 *   release it promised to go in has arrived;
 * - **additive** changes pass once the snapshot is regenerated
 *   (`yarn mcp:manifest`) and committed.
 *
 * Only the shape is snapshotted — no titles, no descriptions — so rewording a
 * sentence never churns the file, and every line of its git history is a real
 * compatibility event. The one thing read out of a description is the
 * release a deprecated parameter goes away in, because the schema has no
 * keyword for it and the description is where the caller is told.
 *
 * The docs build reads this file too, for everything about a parameter
 * except its words: it is the running schema, where the docs build can only
 * read source text.
 */

/** One schema node: a parameter, an element of a list, a field of an object. */
export type ManifestSchema = {
	type: string;
	enum?: string[];
	default?: unknown;
	minimum?: number;
	maximum?: number;
	maxItems?: number;
	deprecated?: boolean;
	/** The release a deprecated parameter stops being accepted in. */
	removedIn?: string;
	items?: ManifestSchema;
	properties?: Record<string, ManifestParam>;
	/** `false` refuses keys it does not name; a schema says what any other key holds. */
	additionalProperties?: false | ManifestSchema;
};

export type ManifestParam = ManifestSchema & { required: boolean };

export type ManifestTool = {
	scope: string;
	/** Any one of these is enough, in place of `scope` alone. */
	anyScope?: string[];
	/** A second grant the token must hold as well as `scope`. */
	alsoNeeds?: string;
	writes: boolean;
	destroys: boolean;
	/** The answer carries `count` and `total`, and `nextOffset` while more is left. */
	pages?: boolean;
	/** A write whose answer leaves out `before` and `after`. */
	quiet?: boolean;
	/** The kind of thing a create makes, which `after` carries. */
	creates?: string;
	deprecated?: string;
	removedIn?: string;
	params: Record<string, ManifestParam>;
};

export type Manifest = Record<string, ManifestTool>;

/**
 * The release a deprecated parameter's description promises it goes in.
 *
 * Every deprecation here is written "… removed in 0.190.0." from a constant,
 * and the answer to a call using it says the same; a deprecation that names
 * no release is refused by the manifest test.
 */
export function removalOf(description: unknown): string | undefined {
	if (typeof description !== 'string') return undefined;
	return /removed in (\d+(?:\.\d+)+)/i.exec(description)?.[1];
}

type RawNode = {
	type?: unknown;
	enum?: unknown;
	default?: unknown;
	minimum?: unknown;
	maximum?: unknown;
	maxItems?: unknown;
	deprecated?: unknown;
	description?: unknown;
	items?: unknown;
	properties?: unknown;
	required?: unknown;
	additionalProperties?: unknown;
};

const byName = <T>(entries: [string, T][]) => entries.sort(([a], [b]) => a.localeCompare(b));

function shapeOf(raw: unknown): ManifestSchema {
	const node = (raw ?? {}) as RawNode;
	const out: ManifestSchema = { type: String(node.type ?? 'unknown') };
	if (Array.isArray(node.enum)) out.enum = [...node.enum].map(String).sort();
	if (node.default !== undefined) out.default = node.default;
	if (typeof node.minimum === 'number') out.minimum = node.minimum;
	if (typeof node.maximum === 'number') out.maximum = node.maximum;
	if (typeof node.maxItems === 'number') out.maxItems = node.maxItems;
	if (node.deprecated) {
		out.deprecated = true;
		const gone = removalOf(node.description);
		if (gone) out.removedIn = gone;
	}
	if (node.items && typeof node.items === 'object') out.items = shapeOf(node.items);
	if (node.properties && typeof node.properties === 'object')
		out.properties = paramsOf(
			node.properties as Record<string, unknown>,
			Array.isArray(node.required) ? node.required : []
		);
	if (node.additionalProperties === false) out.additionalProperties = false;
	else if (node.additionalProperties && typeof node.additionalProperties === 'object')
		out.additionalProperties = shapeOf(node.additionalProperties);
	return out;
}

function paramsOf(
	properties: Record<string, unknown>,
	required: readonly unknown[]
): Record<string, ManifestParam> {
	const needed = new Set(required.map(String));
	const params: Record<string, ManifestParam> = {};
	for (const [name, raw] of byName(Object.entries(properties))) {
		const { type, ...rest } = shapeOf(raw);
		params[name] = { type, required: needed.has(name), ...rest };
	}
	return params;
}

export function currentManifest(): Manifest {
	const manifest: Manifest = {};

	for (const tool of [...TOOLS].sort((a, b) => a.name.localeCompare(b.name))) {
		const params = paramsOf(tool.input.properties, tool.input.required ?? []);
		manifest[tool.name] = {
			scope: tool.scope,
			...(tool.anyScope ? { anyScope: [...tool.anyScope].sort() } : {}),
			...(tool.alsoNeeds ? { alsoNeeds: tool.alsoNeeds } : {}),
			writes: tool.writes,
			destroys: Boolean(tool.destroys),
			...(params.offset ? { pages: true } : {}),
			...(tool.quiet ? { quiet: true } : {}),
			...(tool.creates ? { creates: tool.creates } : {}),
			...(tool.deprecated ? { deprecated: tool.deprecated } : {}),
			...(tool.removedIn ? { removedIn: tool.removedIn } : {}),
			params
		};
	}

	return manifest;
}
