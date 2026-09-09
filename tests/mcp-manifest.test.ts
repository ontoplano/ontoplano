/**
 * The tool surface cannot change shape by accident.
 *
 * MCP hands the client tool names, parameter names and enums as JSON at
 * connect time, with no version negotiation — so a renamed parameter breaks a
 * self-hoster's saved prompts and wrapper scripts at call time, invisibly to
 * this suite, because the caller is a model and not a fixture. The committed
 * `manifest.json` is the snapshot of that surface; this test is the diff.
 *
 * The rule is additive-only: a removal, a parameter turned required, an enum
 * value dropped, or a grant changed fails the suite — unless the committed
 * manifest already carried the deprecation, meaning the warning shipped in an
 * earlier release. Additive changes only need the snapshot regenerated:
 *
 *   yarn mcp:manifest
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { makeDatabase, seedAccounts } from './helpers/db';
import type { Manifest } from '../src/lib/server/mcp/manifest';

// The tools import the services, and the services open the database.
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const FILE = join(import.meta.dirname, '../src/lib/server/mcp/manifest.json');

test('the tool surface only ever grows, unless a removal was announced', async () => {
	const { currentManifest } = await import('../src/lib/server/mcp/manifest');
	const current = currentManifest();

	let committed: Manifest | null;
	try {
		committed = JSON.parse(readFileSync(FILE, 'utf8'));
	} catch {
		committed = null;
	}

	if (committed === null) {
		if (process.env.UPDATE_MCP_MANIFEST) {
			writeFileSync(FILE, JSON.stringify(current, null, '\t') + '\n');
			return;
		}
		expect.fail(`No committed manifest at ${FILE} — run \`yarn mcp:manifest\` and commit it.`);
	}

	const breaking: string[] = [];

	for (const [name, was] of Object.entries(committed)) {
		const is = current[name];

		if (!is) {
			// Gone. Allowed only if the committed manifest carried the warning —
			// i.e. a release already shipped saying it was going.
			if (!was.deprecated)
				breaking.push(`tool \`${name}\` was removed without a deprecation release first`);
			continue;
		}

		if (is.scope !== was.scope)
			breaking.push(`tool \`${name}\` changed scope: \`${was.scope}\` → \`${is.scope}\``);
		if (is.writes !== was.writes)
			breaking.push(`tool \`${name}\` changed writes: ${was.writes} → ${is.writes}`);
		if (is.destroys && !was.destroys)
			breaking.push(
				`tool \`${name}\` now demands the destructive grant — tokens that could call it cannot`
			);

		for (const [param, spec] of Object.entries(was.params)) {
			const now = is.params[param];

			if (!now) {
				if (!spec.deprecated && !was.deprecated)
					breaking.push(`\`${name}.${param}\` was removed without a deprecation release first`);
				continue;
			}
			if (now.required && !spec.required)
				breaking.push(`\`${name}.${param}\` became required — every existing caller omits it`);
			if (now.type !== spec.type)
				breaking.push(`\`${name}.${param}\` changed type: ${spec.type} → ${now.type}`);
			for (const value of spec.enum ?? []) {
				if (!(now.enum ?? []).includes(value) && !spec.deprecated)
					breaking.push(`\`${name}.${param}\` dropped the enum value \`${value}\``);
			}
		}
	}

	/*
	 * The regeneration path refuses the same things the check does — otherwise
	 * `yarn mcp:manifest` on a breaking change would quietly bless it, and the
	 * whole gate would be one habit away from decorative. `force` is the
	 * escape hatch for a break made on purpose, which is a decision for a
	 * major version and a human, not a script.
	 */
	if (process.env.UPDATE_MCP_MANIFEST) {
		if (breaking.length > 0 && process.env.UPDATE_MCP_MANIFEST !== 'force') {
			expect(
				breaking,
				'Refusing to snapshot a breaking change. Mark the old shape `deprecated`, ' +
					'ship a release with both working, and remove it the release after — ' +
					'or, for a break made on purpose, UPDATE_MCP_MANIFEST=force.'
			).toEqual([]);
		}
		writeFileSync(FILE, JSON.stringify(current, null, '\t') + '\n');
		return;
	}

	expect(
		breaking,
		'These changes break callers at call time — saved prompts, wrapper scripts, ' +
			'self-hosters mid-upgrade. Mark the old shape `deprecated`, ship a release ' +
			'with both shapes working, and remove it the release after.'
	).toEqual([]);

	// Everything additive still has to be snapshotted, so the git history of
	// manifest.json is the history of the surface.
	expect(
		current,
		'The tool surface changed (additively). Run `yarn mcp:manifest` and commit the result.'
	).toEqual(committed);
});
