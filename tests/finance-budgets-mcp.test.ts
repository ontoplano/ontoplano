import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const { handleBody } = await import('../src/lib/server/mcp/protocol');
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const budgets = await import('../src/lib/services/budgets');
const { createNotebook } = await import('../src/lib/services/notebooks');
const { listAssistantCalls, putBack } = await import('../src/lib/server/services/assistant-log');
const ctx = { userId: OWNER, now: new Date('2026-10-19T12:00:00Z'), tz: 'UTC' };
function call(
	name: string,
	args: Record<string, unknown> = {},
	options: { scopes?: string[]; userId?: string; confinement?: { kind: string; id: number } } = {}
) {
	const response = handleBody(
		{
			ctx: { ...ctx, userId: options.userId ?? OWNER },
			scopes: options.scopes ?? ['statements:read', 'statements:write', 'destructive'],
			...(options.confinement ? { confinement: options.confinement } : {})
		} as never,
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
	) as {
		error?: unknown;
		result?: { isError?: boolean; structuredContent?: Record<string, unknown> };
	};
	return {
		failed: !!response.error || !!response.result?.isError,
		data: response.result?.structuredContent ?? {},
		response
	};
}
ledgers.createLedger(ctx, { name: 'MCP budgets', currency: 'KES' });
statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });

test('MCP budget CRUD, copy and retry honor grants and leave original bank records untouched', () => {
	const args = {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amount_minor: 600000,
		requestId: 'budget-create-0001'
	};
	expect(call('add_budget', args, { scopes: ['statements:read'] }).failed).toBe(true);
	const made = call('add_budget', args);
	expect(made.failed, JSON.stringify(made.response)).toBe(false);
	const id = made.data.id as number;
	expect(call('add_budget', args).data.id).toBe(id);
	expect(call('budgets', { month: '2026-10' }, { scopes: ['statements:read'] }).data.items).toEqual(
		[expect.objectContaining({ id, amountMinor: 600000 })]
	);
	const before = budgets.getBudget(ctx, id);
	expect(
		call('change_budget', { id, amount_minor: 700000, ifUpdatedAt: before.updatedAt }).failed
	).toBe(false);
	expect(
		call('change_budget', { id, amount_minor: 800000, ifUpdatedAt: before.updatedAt }).failed
	).toBe(true);
	expect(
		call('copy_budgets', {
			from_month: '2026-10',
			to_month: '2026-11',
			requestId: 'budget-copy-0001'
		}).data
	).toMatchObject({ added: 1, skipped: 0 });
	expect(call('copy_budgets', { from_month: '2026-10', to_month: '2026-11' }).data).toMatchObject({
		added: 0,
		skipped: 1
	});
	expect(call('delete_budget', { id }, { scopes: ['statements:write'] }).failed).toBe(true);
	expect(call('delete_budget', { id }).failed).toBe(false);
	const log = listAssistantCalls(ctx).find((row) => row.tool === 'delete_budget')!;
	expect(putBack(ctx, log.id).made).toContain('budget');
	expect(budgets.listBudgets(ctx, { month: '2026-10' })).toHaveLength(1);
	expect(statements.listMovements(ctx)).toEqual([]);
});

test('budget references do not leak another owner and notebook confinement cannot touch account budgets', () => {
	const id = budgets.listBudgets(ctx, { month: '2026-10' })[0].id;
	for (const name of ['change_budget', 'delete_budget'])
		expect(call(name, { id }, { userId: STRANGER }).response).toEqual(
			call(name, { id: 987654 }, { userId: STRANGER }).response
		);
	const book = createNotebook(ctx, { title: 'Unrelated notebook' });
	for (const [name, args] of [
		['budgets', {}],
		['add_budget', { month: '2026-12', category: 'Transport', currency: 'KES', amount_minor: 1 }],
		['change_budget', { id }],
		['delete_budget', { id }],
		['copy_budgets', { from_month: '2026-10', to_month: '2026-12' }],
		['personal_spending', {}]
	] as const)
		expect(call(name, args, { confinement: { kind: 'notebook', id: book } }).failed).toBe(true);
});

test('MCP reports keep windows and currencies explicit and expose refund credits separately from income', () => {
	const ledger = ledgers.listLedgers(ctx)[0];
	statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-09-30',
		amountCents: -100,
		description: 'Transport old'
	});
	const refund = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-01',
		amountCents: 40,
		description: 'Transport credit'
	});
	statements.updateMovement(ctx, refund.id, { kind: 'refund' });
	const report = call('personal_spending', { month: '2026-10' }, { scopes: ['statements:read'] });
	expect(report.failed).toBe(false);
	expect(report.data.currencies).toMatchObject([
		{ currency: 'KES', grossMinor: 0, refundMinor: 40, netMinor: -40, incomeMinor: 0 }
	]);
	expect(
		call('statement_months', { from: '2026-09-01', to: '2026-09-30', currency: 'KES' }).data.months
	).toMatchObject([{ month: '2026-09', outCents: 100 }]);
});
