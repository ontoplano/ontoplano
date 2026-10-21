/**
 * Story 5.2, acceptance 1: the batch verb answers with before and after.
 *
 * Every write in the MCP layer carries the subject as it was and as it is, so
 * a wrong call is reversible from the transcript. `classify_movements` was the
 * one finance verb of the new set that named no single subject and therefore
 * answered both as null — the change was visible in the transcript but not
 * undoable from it. This is the regression for the subject it now declares.
 */
import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const { handleBody } = await import('../src/lib/server/mcp/protocol');
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');

const ctx = { userId: OWNER, now: new Date('2026-10-19T12:00:00Z'), tz: 'UTC' };

function call(
	name: string,
	args: Record<string, unknown>,
	scopes = ['statements:read', 'statements:write']
) {
	const response = handleBody({ ctx, scopes } as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	}) as {
		error?: unknown;
		result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
	};
	return {
		failed: !!response.error || !!response.result?.isError,
		data: response.result?.structuredContent ?? {},
		response
	};
}

test('classify_movements answers with the lines it was told to change, before and after', () => {
	const ledger = ledgers.createLedger(ctx, { name: 'Classify batch', currency: 'KES' });
	const made = (description: string) =>
		statements.recordMovement(ctx, {
			ledgerId: ledger.id,
			occurredOn: '2026-10-01',
			amountCents: -100,
			description
		});

	const first = made('Fare to the station');
	const second = made('Fare home');
	const args = { ids: [first.id, second.id], kind: 'expense' };

	expect(call('classify_movements', args, ['statements:read']).failed).toBe(true);
	const classified = call('classify_movements', args);
	expect(classified.failed, JSON.stringify(classified.response)).toBe(false);

	const before = classified.data.before as { id: number; kind: string | null }[];
	const after = classified.data.after as { id: number; kind: string | null }[];
	expect(before.map((row) => [row.id, row.kind])).toEqual([
		[first.id, null],
		[second.id, null]
	]);
	expect(after.map((row) => [row.id, row.kind])).toEqual([
		[first.id, 'expense'],
		[second.id, 'expense']
	]);
	expect(statements.listMovements(ctx, { ledgerId: ledger.id }).map((row) => row.kind)).toEqual([
		'expense',
		'expense'
	]);
});
