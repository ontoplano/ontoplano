/**
 * The worked examples on the AI agents page are calls that were made.
 *
 * `src/lib/server/mcp/examples.json` is what the page prints under "Common
 * requests": what somebody asks, the call it becomes, and the part of the
 * answer worth reading. Every one is made here, in order, against one fresh
 * account through the same dispatcher a client reaches — so an example that
 * stops being true fails this, rather than sitting on the page misleading
 * whoever copies it.
 *
 * The ids in them are the ones a fresh account hands out, which is why the
 * order matters and why nothing else writes to this database.
 *
 * `answer` is a subset: every key it names must be in the real answer with
 * that value, a list must have exactly the elements named, and a string
 * ending in `…` is matched by what comes before it.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
import examples from '../src/lib/server/mcp/examples.json';
import manifest from '../src/lib/server/mcp/manifest.json';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

type Example = {
	ask: string;
	tool: string;
	arguments: Record<string, unknown>;
	answer?: unknown;
	refused?: string;
	note?: string;
};

type Answer = {
	result?: { isError?: boolean; structuredContent?: unknown; content?: { text?: string }[] };
	error?: unknown;
};

let call: (name: string, args: Record<string, unknown>) => Answer;

beforeAll(async () => {
	const { buildCtx } = await import('../src/lib/services/ctx');
	const { handleBody } = await import('../src/lib/server/mcp/protocol');
	const { ASSISTANT_SCOPES } = await import('../src/lib/server/mcp/tools');
	const ctx = buildCtx(OWNER, { tz: 'UTC', now: new Date('2026-03-14T10:00:00Z') });
	call = (name, args) =>
		handleBody({ ctx, scopes: [...ASSISTANT_SCOPES] } as never, {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name, arguments: args }
		}) as Answer;
});

/** Where `actual` fails to hold what `expected` names, as paths; empty when it holds. */
function mismatches(actual: unknown, expected: unknown, at = 'answer'): string[] {
	if (typeof expected === 'string' && expected.endsWith('…'))
		return typeof actual === 'string' && actual.startsWith(expected.slice(0, -1))
			? []
			: [`${at}: ${JSON.stringify(actual)} does not start ${JSON.stringify(expected)}`];
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length)
			return [`${at}: ${JSON.stringify(actual)} is not a list of ${expected.length}`];
		return expected.flatMap((one, i) => mismatches(actual[i], one, `${at}[${i}]`));
	}
	if (expected !== null && typeof expected === 'object') {
		if (actual === null || typeof actual !== 'object') return [`${at}: ${JSON.stringify(actual)}`];
		return Object.entries(expected).flatMap(([key, one]) =>
			mismatches((actual as Record<string, unknown>)[key], one, `${at}.${key}`)
		);
	}
	return Object.is(actual, expected)
		? []
		: [`${at}: ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`];
}

describe('the common requests on the AI agents page', () => {
	test.each((examples as Example[]).map((one, i) => [i + 1, one.ask, one] as const))(
		'%i. %s',
		(_, __, example) => {
			expect(Object.keys(manifest), 'no such tool').toContain(example.tool);
			expect(example.answer ?? example.refused, 'an example says what comes back').toBeDefined();

			const { result, error } = call(example.tool, example.arguments);

			// The page says a refusal is an invalid-params error, sent before
			// the tool runs.
			if (example.refused) {
				expect(error, 'expected a refusal').toMatchObject({
					code: -32602,
					message: example.refused
				});
				return;
			}
			expect(error).toBeUndefined();
			expect(result?.isError, result?.content?.[0]?.text).not.toBe(true);
			expect(mismatches(result?.structuredContent, example.answer)).toEqual([]);
		}
	);

	test('the comparison fails where it should', () => {
		expect(mismatches({ a: 1, b: 2 }, { a: 1 })).toEqual([]);
		expect(mismatches({ a: 1 }, { a: 2 })).not.toEqual([]);
		expect(mismatches({ items: [1, 2] }, { items: [1] })).not.toEqual([]);
		expect(mismatches('`tag` is going', '`tag` is…')).toEqual([]);
		expect(mismatches('`tags` is going', '`tag` is…')).not.toEqual([]);
		expect(mismatches(undefined, null)).not.toEqual([]);
	});

	test('are all on the page', () => {
		const page = readFileSync('docs/reference/ai-agents.md', 'utf8');
		const missing = (examples as Example[]).filter((one) => !page.includes(one.ask));
		expect(missing.map((one) => one.ask)).toEqual([]);
	});
});
