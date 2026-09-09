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
 *   dropping an **enum value**, or changing a tool's **scope** or grants is
 *   refused outright — unless the thing was marked `deprecated` in the
 *   committed manifest, i.e. the warning shipped in an earlier release;
 * - **additive** changes pass once the snapshot is regenerated
 *   (`yarn mcp:manifest`) and committed.
 *
 * Only the shape is snapshotted — no titles, no descriptions — so rewording a
 * sentence never churns the file, and every line of its git history is a real
 * compatibility event.
 */

export type ManifestParam = {
	type: string;
	required: boolean;
	enum?: string[];
	deprecated?: boolean;
};

export type ManifestTool = {
	scope: string;
	writes: boolean;
	destroys: boolean;
	deprecated?: string;
	params: Record<string, ManifestParam>;
};

export type Manifest = Record<string, ManifestTool>;

export function currentManifest(): Manifest {
	const manifest: Manifest = {};

	for (const tool of [...TOOLS].sort((a, b) => a.name.localeCompare(b.name))) {
		const required = new Set(tool.input.required ?? []);
		const params: Record<string, ManifestParam> = {};

		for (const [name, raw] of Object.entries(tool.input.properties).sort(([a], [b]) =>
			a.localeCompare(b)
		)) {
			const spec = raw as { type?: unknown; enum?: unknown; deprecated?: unknown };
			params[name] = {
				type: String(spec.type ?? 'unknown'),
				required: required.has(name),
				...(Array.isArray(spec.enum) ? { enum: [...spec.enum].map(String).sort() } : {}),
				...(spec.deprecated ? { deprecated: true } : {})
			};
		}

		manifest[tool.name] = {
			scope: tool.scope,
			writes: tool.writes,
			destroys: Boolean(tool.destroys),
			...(tool.deprecated ? { deprecated: tool.deprecated } : {}),
			params
		};
	}

	return manifest;
}
