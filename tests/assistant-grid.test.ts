/**
 * Every permission family on the key form has a name in the reader's language.
 *
 * The table is built from `ASSISTANT_SCOPES`, which is derived from the tools
 * themselves — so a room gaining its own scope adds a row automatically. The
 * names were a hand-written map with `?? subject` under it, and `statements`
 * was added without one: the row printed the raw key, in the middle of a page
 * that was otherwise in Portuguese, and read as a missing translation because
 * that is exactly what it was.
 *
 * Derived on one side and hand-written on the other is the shape that drifts,
 * so this is the thing that notices.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { ASSISTANT_SCOPES } from '../src/lib/server/mcp/tools';
import { messages as english } from '../src/lib/i18n/catalogues/en';

/**
 * The map, read out of the module rather than imported.
 *
 * `+page.server.ts` is a route module: importing it drags in the database, the
 * whole MCP table and `$app` — none of which this is about. The keys are what
 * matters, and they are one regex away.
 */
function labelledSubjects(): Set<string> {
	const source = readFileSync('src/routes/settings/integrations/+page.server.ts', 'utf8');
	const body = source.slice(
		source.indexOf('function subjectLabels'),
		source.indexOf('function assistantGrid')
	);
	return new Set([...body.matchAll(/^\t\t([a-z_]+):\s*t\(/gm)].map((m) => m[1]));
}

describe('the assistant permission table', () => {
	test('names every family of permissions it draws a row for', () => {
		const named = labelledSubjects();
		const subjects = [...new Set(ASSISTANT_SCOPES.map((s) => s.split(':')[0]))];
		for (const subject of subjects) expect(named, subject).toContain(subject);
	});

	test('and the catalogue has the words for them', () => {
		expect(english).toHaveProperty('settings.integrations.bankStatements');
	});
});
