/**
 * The tools page says a description the way the server says it.
 *
 * A deprecated parameter's description is a template: it names the release it
 * goes away in from a constant, and it quotes the name that replaces it in
 * backticks. Read as raw source, the page said "removed in …" and kept the
 * backslashes in front of every backtick.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

import { literalText, paramRow } from '../scripts/lib/mcp-docs.mjs';

const SOURCE = [
	"const GONE_IN = '9.9.0';",
	'const shape = {',
	'	old: {',
	"		type: 'integer',",
	'		deprecated: true,',
	'		description: `Deprecated — use \\`new\\`, which says it better. Removed in ${GONE_IN}.`',
	'	},',
	'	paged: { description: `The rest of ${somethingOnlyTheCodeKnows}.` }',
	'};'
].join('\n');

function descriptionOf(name: string): string {
	const file = ts.createSourceFile('tools.ts', SOURCE, ts.ScriptTarget.Latest, true);
	let found = '';
	const visit = (node: ts.Node) => {
		if (
			ts.isPropertyAssignment(node) &&
			node.name.getText(file) === 'description' &&
			ts.isPropertyAssignment(node.parent.parent) &&
			node.parent.parent.name.getText(file) === name
		)
			found = literalText(node.initializer, file);
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}

describe('a deprecated parameter on the tools page', () => {
	test('names its release and keeps its backticks unescaped', () => {
		const description = descriptionOf('old');
		expect(description).toBe('Deprecated — use `new`, which says it better. Removed in 9.9.0.');
		expect(
			paramRow({ name: 'old', type: 'integer', required: false, deprecated: true, description })
		).toBe(
			'| `old` | integer | — | Deprecated — use `new`, which says it better. Removed in 9.9.0. **Deprecated.** |'
		);
	});

	test('a substitution only the running code knows is still an ellipsis', () => {
		expect(descriptionOf('paged')).toBe('The rest of ….');
	});

	test('the published page says it that way too', () => {
		const page = readFileSync('docs/reference/ai-agents.md', 'utf8');
		const energy = page.split('\n').find((line) => line.startsWith('| `energy`'));
		expect(energy).toBeDefined();
		expect(energy).not.toContain('\\`');
		expect(energy).not.toContain('removed in …');
		expect(energy).toMatch(/removed in \d+\.\d+/);
	});
});
