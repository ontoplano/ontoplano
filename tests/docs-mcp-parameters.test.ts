/**
 * The tools page says what to pass, and says the same as the server.
 *
 * It used to carry a name, a sentence and a scope — so anybody writing a call
 * read `tools.ts` or guessed at the parameters. Now it carries them, which is
 * only worth anything if they cannot drift: the page is generated from the
 * tool table and this checks it against `manifest.json`, which is the
 * committed shape of that same table.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../src/lib/server/mcp/manifest.json';

const PAGE = readFileSync('docs/reference/ai-agents.md', 'utf8');

/** Each tool's section, from its heading to the next one. */
function sectionOf(name: string): string {
	const at = PAGE.indexOf(`### \`${name}\` —`);
	if (at === -1) return '';
	const next = PAGE.indexOf('\n### ', at + 1);
	return PAGE.slice(at, next === -1 ? undefined : next);
}

const tools = Object.entries(manifest) as [
	string,
	{ params: Record<string, { required: boolean; enum?: string[] }> }
][];

describe('the generated tools page', () => {
	test('has a section for every tool the server offers', () => {
		const missing = tools.filter(([name]) => sectionOf(name) === '').map(([name]) => name);
		expect(missing).toEqual([]);
	});

	test('names every parameter of every tool', () => {
		const missing: string[] = [];
		for (const [name, tool] of tools) {
			const section = sectionOf(name);
			for (const param of Object.keys(tool.params)) {
				if (!section.includes(`\`${param}\``)) missing.push(`${name}.${param}`);
			}
		}
		expect(missing, 'parameters on the server that the page does not mention').toEqual([]);
	});

	test('marks the required ones as required', () => {
		const wrong: string[] = [];
		for (const [name, tool] of tools) {
			const section = sectionOf(name);
			for (const [param, spec] of Object.entries(tool.params)) {
				if (!spec.required) continue;
				const row = section.split('\n').find((line) => line.startsWith(`| \`${param}\``));
				if (!row || !/\|\s*yes\s*\|/.test(row)) wrong.push(`${name}.${param}`);
			}
		}
		expect(wrong, 'required parameters the page does not mark').toEqual([]);
	});

	test('lists the values an enum allows', () => {
		const wrong: string[] = [];
		for (const [name, tool] of tools) {
			const section = sectionOf(name);
			for (const [param, spec] of Object.entries(tool.params)) {
				if (!spec.enum) continue;
				const row = section.split('\n').find((line) => line.startsWith(`| \`${param}\``));
				for (const value of spec.enum) {
					if (!row?.includes(`\`${value}\``)) wrong.push(`${name}.${param}=${value}`);
				}
			}
		}
		expect(wrong, 'enum values the page does not list').toEqual([]);
	});

	test('says so where a tool takes nothing', () => {
		const bare = tools.filter(([, tool]) => Object.keys(tool.params).length === 0);
		expect(bare.length).toBeGreaterThan(0);
		for (const [name] of bare) expect(sectionOf(name)).toContain('Takes no parameters');
	});
});
