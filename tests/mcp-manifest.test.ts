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
 * value dropped, a bound tightened, a default changed, or a grant changed
 * fails the suite — at any depth, so a field inside a list's items counts the
 * same as a top-level one — unless the committed manifest already carried the
 * deprecation, meaning the warning shipped in an earlier release, and the
 * release it named has arrived. Additive changes only need the snapshot
 * regenerated:
 *
 *   yarn mcp:manifest
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { makeDatabase, seedAccounts } from './helpers/db';
import type { Manifest, ManifestParam, ManifestSchema } from '../src/lib/server/mcp/manifest';

// The tools import the services, and the services open the database.
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const FILE = join(import.meta.dirname, '../src/lib/server/mcp/manifest.json');
const VERSION: string = JSON.parse(
	readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')
).version;

/** `0.190` against `0.184.0`, part by part; a missing part is nought. */
function versionAtLeast(have: string, wanted: string): boolean {
	const a = have.split('.').map(Number);
	const b = wanted.split('.').map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return true;
}

/** Whether a deprecated thing may go now: announced, and its release reached. */
const mayGo = (spec: { deprecated?: unknown; removedIn?: string }) =>
	Boolean(spec.deprecated) && (!spec.removedIn || versionAtLeast(VERSION, spec.removedIn));

/**
 * Every way one schema node can break a caller that worked against the other.
 *
 * `where` names it as a caller would — `log_workout.measures[].activity`.
 */
function breaksIn(where: string, was: ManifestSchema, now: ManifestSchema): string[] {
	const out: string[] = [];
	if (now.type !== was.type) out.push(`\`${where}\` changed type: ${was.type} → ${now.type}`);

	for (const value of was.enum ?? [])
		if (!(now.enum ?? []).includes(value) && !was.deprecated)
			out.push(`\`${where}\` dropped the enum value \`${value}\``);
	if (!was.enum && now.enum) out.push(`\`${where}\` now only takes the values of an enum`);

	if (was.default !== undefined && JSON.stringify(now.default) !== JSON.stringify(was.default))
		out.push(
			`\`${where}\` changed its default: ${JSON.stringify(was.default)} → ${JSON.stringify(now.default)} — every caller that leaves it out gets something else`
		);

	if (now.minimum !== undefined && (was.minimum === undefined || now.minimum > was.minimum))
		out.push(`\`${where}\` raised its minimum: ${was.minimum ?? 'none'} → ${now.minimum}`);
	if (now.maximum !== undefined && (was.maximum === undefined || now.maximum < was.maximum))
		out.push(`\`${where}\` lowered its maximum: ${was.maximum ?? 'none'} → ${now.maximum}`);
	if (now.maxItems !== undefined && (was.maxItems === undefined || now.maxItems < was.maxItems))
		out.push(`\`${where}\` holds fewer items: ${was.maxItems ?? 'any'} → ${now.maxItems}`);

	if (was.items && now.items) out.push(...breaksIn(`${where}[]`, was.items, now.items));
	if (was.properties || now.properties)
		out.push(...paramBreaks(where, was.properties ?? {}, now.properties ?? {}));

	if (now.additionalProperties === false && was.additionalProperties !== false && !was.properties)
		out.push(`\`${where}\` stopped taking keys it does not name`);
	if (typeof was.additionalProperties === 'object' && typeof now.additionalProperties === 'object')
		out.push(...breaksIn(`${where}.*`, was.additionalProperties, now.additionalProperties));
	return out;
}

function paramBreaks(
	where: string,
	was: Record<string, ManifestParam>,
	now: Record<string, ManifestParam>
): string[] {
	const out: string[] = [];
	for (const [name, spec] of Object.entries(was)) {
		const at = `${where}.${name}`;
		const is = now[name];
		if (!is) {
			if (!spec.deprecated) out.push(`\`${at}\` was removed without a deprecation release first`);
			else if (!mayGo(spec))
				out.push(
					`\`${at}\` was removed before ${spec.removedIn}, the release it was promised to go in`
				);
			continue;
		}
		if (is.required && !spec.required)
			out.push(`\`${at}\` became required — every existing caller omits it`);
		out.push(...breaksIn(at, spec, is));
	}
	for (const [name, spec] of Object.entries(now))
		if (!was[name] && spec.required)
			out.push(`\`${where}.${name}\` is new and required — every existing caller omits it`);
	return out;
}

/** What a caller written against `committed` would find broken in `current`. */
function breakingChanges(committed: Manifest, current: Manifest): string[] {
	const breaking: string[] = [];

	for (const [name, was] of Object.entries(committed)) {
		const is = current[name];

		if (!is) {
			// Gone. Allowed only if the committed manifest carried the warning —
			// i.e. a release already shipped saying it was going.
			if (!was.deprecated)
				breaking.push(`tool \`${name}\` was removed without a deprecation release first`);
			else if (!mayGo({ deprecated: true, removedIn: was.removedIn }))
				breaking.push(`tool \`${name}\` was removed before ${was.removedIn}, as promised`);
			continue;
		}

		if (is.scope !== was.scope)
			breaking.push(`tool \`${name}\` changed scope: \`${was.scope}\` → \`${is.scope}\``);
		if (is.alsoNeeds !== was.alsoNeeds && is.alsoNeeds !== undefined)
			breaking.push(
				`tool \`${name}\` now also needs \`${is.alsoNeeds}\` — tokens that could call it cannot`
			);
		for (const one of was.anyScope ?? [])
			if (is.anyScope && !is.anyScope.includes(one))
				breaking.push(`tool \`${name}\` no longer answers to \`${one}\``);
		if (was.anyScope && !is.anyScope)
			breaking.push(`tool \`${name}\` answers to \`${is.scope}\` alone now`);
		if (is.writes !== was.writes)
			breaking.push(`tool \`${name}\` changed writes: ${was.writes} → ${is.writes}`);
		if (is.destroys && !was.destroys)
			breaking.push(
				`tool \`${name}\` now demands the destructive grant — tokens that could call it cannot`
			);
		// The answer is a contract too: a reader paging with `nextOffset`, or
		// undoing from `before`, stops working when either goes.
		if (was.pages && !is.pages) breaking.push(`tool \`${name}\` stopped answering a page`);
		if (is.quiet && !was.quiet)
			breaking.push(`tool \`${name}\` stopped answering with \`before\` and \`after\``);

		breaking.push(...paramBreaks(name, was.deprecated ? {} : was.params, is.params));
	}
	return breaking;
}

function readCommitted(): Manifest | null {
	try {
		return JSON.parse(readFileSync(FILE, 'utf8'));
	} catch {
		return null;
	}
}

test('the tool surface only ever grows, unless a removal was announced', async () => {
	const { currentManifest } = await import('../src/lib/server/mcp/manifest');
	const current = currentManifest();
	const committed = readCommitted();

	if (committed === null) {
		if (process.env.UPDATE_MCP_MANIFEST) {
			writeFileSync(FILE, JSON.stringify(current, null, '\t') + '\n');
			return;
		}
		expect.fail(`No committed manifest at ${FILE} — run \`yarn mcp:manifest\` and commit it.`);
	}

	const breaking = breakingChanges(committed, current);

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

test('every deprecation names the release it goes in', async () => {
	const { currentManifest } = await import('../src/lib/server/mcp/manifest');
	const silent: string[] = [];
	const walk = (where: string, node: ManifestSchema) => {
		if (node.deprecated && !node.removedIn) silent.push(where);
		if (node.items) walk(`${where}[]`, node.items);
		for (const [name, inner] of Object.entries(node.properties ?? {}))
			walk(`${where}.${name}`, inner);
	};
	for (const [name, tool] of Object.entries(currentManifest())) {
		if (tool.deprecated && !tool.removedIn) silent.push(name);
		for (const [param, spec] of Object.entries(tool.params)) walk(`${name}.${param}`, spec);
	}
	expect(silent, 'deprecated with no "removed in <version>" in the description').toEqual([]);
});

describe('the diff itself', () => {
	const param = (over: Partial<ManifestParam> = {}): ManifestParam => ({
		type: 'integer',
		required: false,
		...over
	});
	const tool = (params: Record<string, ManifestParam>, over = {}): Manifest[string] => ({
		scope: 'tasks:read',
		writes: false,
		destroys: false,
		params,
		...over
	});

	test('finds a break inside a list of objects', () => {
		const was = {
			t: tool({
				lines: param({
					type: 'array',
					items: { type: 'object', properties: { unit: param({ type: 'string' }) } }
				})
			})
		};
		const now = {
			t: tool({ lines: param({ type: 'array', items: { type: 'object', properties: {} } }) })
		};
		expect(breakingChanges(was, now)).toEqual([
			'`t.lines[].unit` was removed without a deprecation release first'
		]);
	});

	test('refuses a tighter bound, a moved default and a second grant', () => {
		const was = { t: tool({ limit: param({ default: 50, maximum: 200 }) }) };
		const now = {
			t: tool({ limit: param({ default: 20, maximum: 100 }) }, { alsoNeeds: 'notes:read' })
		};
		const said = breakingChanges(was, now).join('\n');
		expect(said).toMatch(/now also needs `notes:read`/);
		expect(said).toMatch(/changed its default: 50 → 20/);
		expect(said).toMatch(/lowered its maximum: 200 → 100/);
	});

	test('lets a deprecated parameter go once its release has arrived, and not before', () => {
		const gone = { t: tool({}) };
		const early = { t: tool({ old: param({ deprecated: true, removedIn: '999.0.0' }) }) };
		const due = { t: tool({ old: param({ deprecated: true, removedIn: '0.1.0' }) }) };
		expect(breakingChanges(early, gone)).toEqual([
			'`t.old` was removed before 999.0.0, the release it was promised to go in'
		]);
		expect(breakingChanges(due, gone)).toEqual([]);
	});

	test('widening is not a break', () => {
		const was = { t: tool({ n: param({ maximum: 5 }) }, { anyScope: ['a'] }) };
		const now = {
			t: tool({ n: param({ maximum: 10 }), extra: param() }, { anyScope: ['a', 'b'] })
		};
		expect(breakingChanges(was, now)).toEqual([]);
	});
});
