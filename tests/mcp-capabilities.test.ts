/**
 * What an assistant can do to each kind of thing, beside what the app can.
 *
 * `src/lib/server/mcp/capabilities.json` places every MCP tool under a room
 * and a verb, and names the form action that does each verb in the app. The
 * AI agents page draws its capability matrix from it. Held here:
 *
 * - every tool the server has is placed, and every tool placed exists;
 * - a tool sits under a verb its manifest entry agrees with — a read does not
 *   write, a delete destroys, a create can be retried with `requestId`;
 * - every app action named is in the file named;
 * - every verb the app has and MCP has not is explained, as a gap
 *   (`missing`) or a decision (`withheld`) — so the gap list is the matrix,
 *   and a new app verb without an MCP one cannot go unnoticed. A verb MCP
 *   has in part (an item can be filed but not renamed) may carry one too.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import capabilities from '../src/lib/server/mcp/capabilities.json';
import manifest from '../src/lib/server/mcp/manifest.json';

type Verb = 'create' | 'read' | 'change' | 'archive' | 'unarchive' | 'delete' | 'reorder';
type Domain = {
	name: string;
	mcp: Partial<Record<Verb, string[]>>;
	app: Partial<Record<Verb, string[]>>;
	missing?: Partial<Record<Verb, string>>;
	withheld?: Partial<Record<Verb, string>>;
};
type Shape = { writes: boolean; destroys: boolean; params: Record<string, unknown> };

const VERBS = capabilities.verbs as Verb[];
const DOMAINS = capabilities.domains as Domain[];
const TOOLS = manifest as Record<string, Shape>;

const placed = (domain: Domain) =>
	VERBS.flatMap((verb) => (domain.mcp[verb] ?? []).map((tool) => ({ verb, tool })));

describe('the capability matrix', () => {
	test('places every tool, and only tools that exist', () => {
		const named = new Set([
			...DOMAINS.flatMap((d) => placed(d).map((p) => p.tool)),
			...Object.keys(capabilities.elsewhere)
		]);
		expect(Object.keys(TOOLS).filter((tool) => !named.has(tool))).toEqual([]);
		expect([...named].filter((tool) => !TOOLS[tool])).toEqual([]);
	});

	test('uses only the verbs it lists', () => {
		for (const d of DOMAINS)
			for (const part of [d.mcp, d.app, d.missing ?? {}, d.withheld ?? {}])
				for (const verb of Object.keys(part)) expect(VERBS, `${d.name}: ${verb}`).toContain(verb);
	});

	test('puts each tool under a verb its manifest agrees with', () => {
		for (const d of DOMAINS)
			for (const { verb, tool } of placed(d)) {
				const shape = TOOLS[tool];
				const at = `${d.name} ${verb}: ${tool}`;
				if (verb === 'read') expect(shape.writes, at).toBe(false);
				else expect(shape.writes, at).toBe(true);
				if (verb === 'delete') expect(shape.destroys, at).toBe(true);
				if (['create', 'archive', 'unarchive', 'reorder'].includes(verb))
					expect(shape.destroys, at).toBe(false);
				if (verb === 'create') expect(Object.keys(shape.params), at).toContain('requestId');
			}
	});

	test('names app actions that are where it says', () => {
		for (const d of DOMAINS)
			for (const verb of VERBS)
				for (const where of d.app[verb] ?? []) {
					const [file, action] = where.split('#');
					expect(existsSync(file), where).toBe(true);
					const source = readFileSync(file, 'utf8');
					const declared =
						action === 'load'
							? /export (const|async function|function) load\b/.test(source)
							: new RegExp(`(^|[\\s{,])${action}\\s*(:|\\(|,|\\n\\s*})`, 'm').test(source);
					expect(declared, where).toBe(true);
				}
	});

	test('explains every verb the app has and MCP has not', () => {
		for (const d of DOMAINS)
			for (const verb of VERBS) {
				const inApp = (d.app[verb] ?? []).length > 0;
				const overMcp = (d.mcp[verb] ?? []).length > 0;
				const said = d.missing?.[verb] ?? d.withheld?.[verb];
				const at = `${d.name}: ${verb}`;
				if (inApp && !overMcp) expect(said, `${at} is in the app and not over MCP`).toBeTruthy();
				if (d.missing?.[verb]) expect(inApp, `${at}: missing from what?`).toBe(true);
			}
	});

	test('is on the AI agents page, one row per room', () => {
		const page = readFileSync('docs/reference/ai-agents.md', 'utf8');
		for (const d of DOMAINS) expect(page, d.name).toMatch(new RegExp(`\\| ${d.name} +\\|`));
	});
});
