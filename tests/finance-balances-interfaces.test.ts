import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgers = await import('../src/lib/services/ledgers');
const { handleBody } = await import('../src/lib/server/mcp/protocol');
const { createNotebook } = await import('../src/lib/services/notebooks');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-02T12:00:00Z') };

function call(
	name: string,
	args: Record<string, unknown>,
	scopes = ['statements:read', 'statements:write', 'destructive'],
	confinement?: { kind: string; id: number }
) {
	const response = handleBody({ ctx, scopes, ...(confinement ? { confinement } : {}) } as never, {
		jsonrpc: '2.0',
		id: 1,
		method: 'tools/call',
		params: { name, arguments: args }
	}) as { error?: unknown; result?: { isError?: boolean; content?: { text: string }[] } };
	const failed = !!response.error || !!response.result?.isError;
	return {
		failed,
		data:
			!failed && response.result?.content?.[0]?.text
				? JSON.parse(response.result.content[0].text)
				: response
	};
}

test('MCP declares original currency/opening, stores evidence, preserves omitted fields and enforces scopes', () => {
	const made = call('add_ledger', {
		name: 'MCP synthetic',
		currency: 'KES',
		opening_minor: 13262,
		opening_on: '2026-09-01'
	});
	expect(made.failed).toBe(false);
	const id = made.data.id as number;
	expect(ledgers.getLedger(ctx, id)).toMatchObject({
		currency: 'KES',
		openingMinor: 13262,
		openingOn: '2026-09-01'
	});
	expect(call('change_ledger', { id, name: 'Renamed synthetic' }).failed).toBe(false);
	expect(ledgers.getLedger(ctx, id)).toMatchObject({
		currency: 'KES',
		openingMinor: 13262,
		openingOn: '2026-09-01'
	});
	const args = {
		ledger_id: id,
		as_of: '2026-10-01',
		observed_minor: 13262,
		requestId: 'balance-observation-0001'
	};
	expect(call('record_balance_check', args, ['statements:read']).failed).toBe(true);
	const check = call('record_balance_check', args);
	expect(check.failed).toBe(false);
	expect(call('record_balance_check', args).data.id).toBe(check.data.id);
	expect(call('balance_checks', { ledger_id: id }, ['statements:read']).data.checks).toHaveLength(
		1
	);
	expect(call('delete_balance_check', { id: check.data.id }, ['statements:write']).failed).toBe(
		true
	);
	expect(ledgers.listBalanceChecks(ctx, id)).toHaveLength(1);
	expect(call('delete_balance_check', { id: check.data.id }).failed).toBe(false);
	expect(ledgers.listBalanceChecks(ctx, id)).toEqual([]);
});

test('notebook-confined MCP cannot read, record or delete observations outside its ledgers', () => {
	const book = createNotebook(ctx, { title: 'Finance confinement', modules: 'ledgers' });
	const inside = ledgers.createLedger(ctx, { name: 'Inside', notebookId: book });
	const outside = ledgers.createLedger(ctx, { name: 'Outside' });
	const check = ledgers.recordBalanceCheck(ctx, {
		ledgerId: outside.id,
		asOf: '2026-10-01',
		observedMinor: 10
	});
	const confinement = { kind: 'notebook', id: book };
	expect(call('balance_checks', { ledger_id: outside.id }, undefined, confinement).failed).toBe(
		true
	);
	expect(
		call(
			'record_balance_check',
			{ ledger_id: outside.id, as_of: '2026-10-02', observed_minor: 10 },
			undefined,
			confinement
		).failed
	).toBe(true);
	expect(call('delete_balance_check', { id: check.id }, undefined, confinement).failed).toBe(true);
	const own = call(
		'record_balance_check',
		{ ledger_id: inside.id, as_of: '2026-10-01', observed_minor: 10 },
		undefined,
		confinement
	);
	expect(own.failed).toBe(false);
	expect(call('delete_balance_check', { id: own.data.id }, undefined, confinement).failed).toBe(
		false
	);
	expect(ledgers.listBalanceChecks(ctx, outside.id)).toHaveLength(1);
});

test('account export/import remaps checks with openings intact and account deletion leaves no evidence behind', async () => {
	const account = await import('../src/lib/server/services/account');
	const { importAccount } = await import('../src/lib/services/account-import');
	const { deleteAccount, unaccountedTables } = await import('../src/lib/services/account-data');
	const l = ledgers.createLedger(ctx, {
		name: 'Portable',
		currency: 'KES',
		openingOn: '2026-09-01',
		openingMinor: 13262
	});
	ledgers.recordBalanceCheck(ctx, {
		ledgerId: l.id,
		asOf: '2026-10-01',
		observedMinor: 13262,
		note: 'Synthetic statement'
	});
	const file = account.exportAccount(OWNER, ctx.now);
	expect(file.data.financeBalanceChecks).toBeDefined();
	expect(unaccountedTables()).toEqual([]);
	await importAccount(STRANGER, file);
	const other = { ...ctx, userId: STRANGER };
	const restored = ledgers.listLedgers(other).find((row) => row.name === 'Portable')!;
	expect(restored.id).not.toBe(l.id);
	expect(restored).toMatchObject({
		openingMinor: 13262,
		openingOn: '2026-09-01',
		currency: 'KES',
		balanceStatus: 'verified'
	});
	expect(ledgers.listBalanceChecks(other, restored.id)[0]).toMatchObject({
		ledgerId: restored.id,
		observedMinor: 13262,
		note: 'Synthetic statement'
	});
	deleteAccount(STRANGER);
	expect(
		database.get('select count(*) as n from finance_balance_checks where user_id = ?', STRANGER)
	).toEqual({ n: 0 });
	expect(ledgers.listBalanceChecks(ctx, l.id)).toHaveLength(1);
});
