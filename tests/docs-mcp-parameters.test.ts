/**
 * The tools page says what to pass, and says the same as the server.
 *
 * It used to carry a name, a sentence and a scope — so anybody writing a call
 * read `tools.ts` or guessed at the parameters. Now it carries them, which is
 * only worth anything if they cannot drift: the page is generated from the
 * tool table and this checks it against `manifest.json`, which is the
 * committed shape of that same table — every field at every depth, its
 * bounds and default, the grants a tool needs and what it answers.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import manifestJson from '../src/lib/server/mcp/manifest.json';
import type {
	Manifest,
	ManifestParam,
	ManifestSchema,
	ManifestTool
} from '../src/lib/server/mcp/manifest';

const manifest = manifestJson as Manifest;
const PAGE = readFileSync('docs/reference/ai-agents.md', 'utf8');

/** Each tool's section, from its heading to the next one. */
function sectionOf(name: string): string {
	const at = PAGE.indexOf(`### \`${name}\` —`);
	if (at === -1) return '';
	const next = PAGE.indexOf('\n### ', at + 1);
	return PAGE.slice(at, next === -1 ? undefined : next);
}

/** A parameter's row in a section, by the path a caller writes. */
function rowOf(section: string, path: string): string | undefined {
	return section.split('\n').find((line) => line.startsWith(`| \`${path}\``));
}

const tools = Object.entries(manifest) as [string, ManifestTool][];

/** Every node of every tool's schema, with the path the page names it by. */
function everyParam(): { tool: string; path: string; spec: ManifestParam }[] {
	const out: { tool: string; path: string; spec: ManifestParam }[] = [];
	const walk = (tool: string, path: string, spec: ManifestParam) => {
		out.push({ tool, path, spec });
		const inner: ManifestSchema | undefined = spec.items?.properties ? spec.items : spec;
		const at = spec.items?.properties ? `${path}[]` : path;
		for (const [name, field] of Object.entries(inner?.properties ?? {}))
			walk(tool, `${at}.${name}`, field);
	};
	for (const [tool, shape] of tools)
		for (const [name, spec] of Object.entries(shape.params)) walk(tool, name, spec);
	return out;
}

describe('the generated tools page', () => {
	test('has a section for every tool the server offers', () => {
		const missing = tools.filter(([name]) => sectionOf(name) === '').map(([name]) => name);
		expect(missing).toEqual([]);
	});

	test('has a row for every parameter, the fields inside lists and objects included', () => {
		const all = everyParam();
		expect(all.some(({ path }) => path.includes('[].'))).toBe(true);
		const missing = all
			.filter(({ tool, path }) => !rowOf(sectionOf(tool), path))
			.map(({ tool, path }) => `${tool}.${path}`);
		expect(missing, 'parameters on the server that the page does not mention').toEqual([]);
	});

	test('says what every parameter is', () => {
		const silent = everyParam()
			.filter(({ tool, path }) => /\|\s*\|$/.test(rowOf(sectionOf(tool), path) ?? ''))
			.map(({ tool, path }) => `${tool}.${path}`);
		expect(silent, 'rows with nothing in "What it is" — give the schema a description').toEqual([]);
	});

	test('marks the required ones as required', () => {
		const wrong = everyParam()
			.filter(({ spec }) => spec.required)
			.filter(({ tool, path }) => !/\|\s*yes\s*\|/.test(rowOf(sectionOf(tool), path) ?? ''))
			.map(({ tool, path }) => `${tool}.${path}`);
		expect(wrong, 'required parameters the page does not mark').toEqual([]);
	});

	test('lists the values an enum allows', () => {
		const wrong: string[] = [];
		for (const { tool, path, spec } of everyParam()) {
			const row = rowOf(sectionOf(tool), path);
			for (const value of spec.enum ?? [])
				if (!row?.includes(`\`${value}\``)) wrong.push(`${tool}.${path}=${value}`);
		}
		expect(wrong, 'enum values the page does not list').toEqual([]);
	});

	test('gives the default, the bounds and the release a deprecated one goes in', () => {
		const wrong: string[] = [];
		for (const { tool, path, spec } of everyParam()) {
			const row = rowOf(sectionOf(tool), path) ?? '';
			const say = (why: string) => wrong.push(`${tool}.${path}: ${why}`);
			if (spec.default !== undefined) {
				const shown =
					typeof spec.default === 'string' ? spec.default : JSON.stringify(spec.default);
				if (!row.includes(`Default \`${shown}\``)) say(`default ${shown}`);
			}
			if (spec.minimum !== undefined && !row.includes(String(spec.minimum))) say('minimum');
			if (spec.maximum !== undefined && !row.includes(String(spec.maximum))) say('maximum');
			if (spec.deprecated && !row.includes(`removed in ${spec.removedIn}`)) say('removal');
		}
		expect(wrong).toEqual([]);
	});

	test('names every grant a tool needs, and what it answers', () => {
		const wrong: string[] = [];
		for (const [name, tool] of tools) {
			const needs = sectionOf(name)
				.split('\n')
				.find((line) => line.startsWith('_Needs '));
			if (!needs) {
				wrong.push(`${name}: no _Needs_ line`);
				continue;
			}
			const grants = tool.anyScope ?? [tool.scope, ...(tool.alsoNeeds ? [tool.alsoNeeds] : [])];
			for (const grant of grants)
				if (!needs.includes(`\`${grant}\``)) wrong.push(`${name}: ${grant}`);
			if (tool.destroys && !needs.includes('`destructive`')) wrong.push(`${name}: destructive`);
			if (tool.pages && !needs.includes('answers a page')) wrong.push(`${name}: pages`);
			if (tool.writes && !tool.quiet && !needs.includes('`before` and `after`'))
				wrong.push(`${name}: before and after`);
		}
		expect(wrong).toEqual([]);
	});

	test('says so where a tool takes nothing', () => {
		const bare = tools.filter(([, tool]) => Object.keys(tool.params).length === 0);
		expect(bare.length).toBeGreaterThan(0);
		for (const [name] of bare) expect(sectionOf(name)).toContain('Takes no parameters');
	});

	test('lists every deprecated argument with its replacement and release', () => {
		const table = PAGE.slice(PAGE.indexOf('| Old spelling |'));
		for (const { spec, path } of everyParam()) {
			if (!spec.deprecated) continue;
			const row = table.split('\n').find((line) => line.startsWith(`| \`${path}\``));
			expect(row, path).toContain(String(spec.removedIn));
			expect(row, path).not.toContain('| — |');
		}
	});
});
