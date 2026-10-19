import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };
const other = { ...ctx, userId: STRANGER };
ledgers.createLedger(ctx, { name: 'Budget source', currency: 'KES' });
statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });

test('a monthly ceiling never moves ledger money and shares personal spending arithmetic', async () => {
	const budgets = await import('../src/lib/services/budgets');
	const ledger = ledgers.listLedgers(ctx)[0];
	statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-01',
		amountCents: -450000,
		description: 'Transport purchase'
	});
	const before = ledgers.getLedger(ctx, ledger.id);
	const budget = budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 600000
	});
	expect(budget).toMatchObject({
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 600000,
		spentMinor: 450000,
		remainingMinor: 150000,
		creditMinor: 0,
		orphaned: false
	});
	expect(ledgers.getLedger(ctx, ledger.id)).toEqual(before);
	expect(() =>
		budgets.createBudget(ctx, {
			month: '2026-10',
			category: 'Transport',
			currency: 'KES',
			amountMinor: 600000
		})
	).toThrow(/already|exists/i);
	expect(budgets.listBudgets(other)).toEqual([]);
});

test('refund credits stay in their actual month and never enlarge a budget', async () => {
	const budgets = await import('../src/lib/services/budgets');
	const ledger = ledgers.listLedgers(ctx)[0];
	statements.createRule(ctx, { kind: 'category', name: 'Clothing', pattern: 'Clothing' });
	const expense = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-09-01',
		amountCents: -120000,
		description: 'Clothing expense'
	});
	const refund = statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-03',
		amountCents: 40000,
		description: 'Unrelated refund wording'
	});
	statements.linkMovement(ctx, { id: refund.id, parentId: expense.id, relation: 'refund' });
	for (const month of ['2026-09', '2026-10', '2026-11'])
		budgets.createBudget(ctx, {
			month,
			category: 'Clothing',
			currency: 'KES',
			amountMinor: 200000
		});
	expect(
		budgets.listBudgets(ctx, { month: '2026-10' }).find((row) => row.category === 'Clothing')
	).toMatchObject({ spentMinor: 0, remainingMinor: 200000, creditMinor: 40000 });
	expect(budgets.listBudgets(ctx, { month: '2026-09' })[0]).toMatchObject({
		spentMinor: 120000,
		remainingMinor: 80000,
		creditMinor: 0
	});
	expect(budgets.listBudgets(ctx, { month: '2026-11' })[0]).toMatchObject({
		spentMinor: 0,
		remainingMinor: 200000,
		creditMinor: 0
	});
});

test('exact amounts, months, categories, ledger currencies and persisted uniqueness are validated', async () => {
	const budgets = await import('../src/lib/services/budgets');
	const input = { month: '2026-12', category: 'Transport', currency: 'KES', amountMinor: 600000 };
	for (const change of [
		{ month: '2026-13' },
		{ month: '2026-1' },
		{ amountMinor: -1 },
		{ amountMinor: 1.5 },
		{ amountMinor: Number.MAX_SAFE_INTEGER + 1 },
		{ category: 'Missing rule' }
	])
		expect(() => budgets.createBudget(ctx, { ...input, ...change })).toThrow();
	expect(() => budgets.createBudget(ctx, { ...input, currency: 'EUR' })).toThrow(/EUR/);
	const budget = budgets.createBudget(ctx, input);
	expect(() =>
		database.exec(
			'insert into finance_budgets(user_id,month,category,currency,amount_minor) values (?,?,?,?,?)',
			OWNER,
			input.month,
			input.category,
			input.currency,
			input.amountMinor
		)
	).toThrow(/unique/i);
	for (const [month, amount] of [
		['2026-00', 1],
		['2026-12', -1],
		['2026-12', 0.5]
	] as const)
		expect(() =>
			database.exec(
				'insert into finance_budgets(user_id,month,category,currency,amount_minor) values (?,?,?,?,?)',
				OWNER,
				month,
				'Invalid persisted row',
				'KES',
				amount
			)
		).toThrow(/check/i);
	budgets.deleteBudget(ctx, budget.id);
});

test('copy preserves existing buckets, orphans remain visible, and competing edits conflict', async () => {
	const budgets = await import('../src/lib/services/budgets');
	const rule = statements.createRule(ctx, {
		kind: 'category',
		name: 'Orphan source',
		pattern: 'orphan-source'
	});
	budgets.createBudget(ctx, {
		month: '2026-11',
		category: 'Orphan source',
		currency: 'KES',
		amountMinor: 10000
	});
	const target = budgets.createBudget(ctx, {
		month: '2026-12',
		category: 'Clothing',
		currency: 'KES',
		amountMinor: 9900
	});
	expect(budgets.copyBudgets(ctx, { fromMonth: '2026-11', toMonth: '2026-12' })).toEqual({
		added: 1,
		skipped: 1
	});
	expect(budgets.copyBudgets(ctx, { fromMonth: '2026-11', toMonth: '2026-12' })).toEqual({
		added: 0,
		skipped: 2
	});
	expect(budgets.getBudget(ctx, target.id).amountMinor).toBe(9900);
	statements.updateRule(ctx, rule.id, { name: 'Renamed rule' });
	expect(
		budgets.listBudgets(ctx, { month: '2026-12' }).find((row) => row.category === 'Orphan source')
	).toMatchObject({ orphaned: true, amountMinor: 10000 });
	budgets.updateBudget(ctx, target.id, { amountMinor: 12000, updatedAt: target.updatedAt });
	expect(() =>
		budgets.updateBudget(ctx, target.id, { amountMinor: 13000, updatedAt: target.updatedAt })
	).toThrow(/changed/i);
	for (const id of [target.id, 999999]) {
		expect(() => budgets.updateBudget(other, id, { amountMinor: 1 })).toThrow('budget not found');
		expect(() => budgets.deleteBudget(other, id)).toThrow('budget not found');
	}
	expect(budgets.getBudget(ctx, target.id).amountMinor).toBe(12000);
});

test('budgets export, remap, restore and delete with their account while source records survive', async () => {
	const budgets = await import('../src/lib/services/budgets');
	const { exportAccount } = await import('../src/lib/server/services/account');
	const { importAccount } = await import('../src/lib/services/account-import');
	const { deleteAccount, unaccountedTables } = await import('../src/lib/services/account-data');
	expect(unaccountedTables()).toEqual([]);
	const file = exportAccount(OWNER, ctx.now);
	expect(file.data.financeBudgets).toBeDefined();
	await importAccount(STRANGER, file);
	const source = budgets.listBudgets(ctx, { month: '2026-10' });
	const restored = budgets.listBudgets(other, { month: '2026-10' });
	expect(restored.map((row) => ({ ...row, id: 0, userId: '' }))).toEqual(
		source.map((row) => ({ ...row, id: 0, userId: '' }))
	);
	expect(restored[0].id).not.toBe(source[0].id);
	deleteAccount(STRANGER);
	expect(
		database.get('select count(*) as n from finance_budgets where user_id=?', STRANGER)
	).toEqual({ n: 0 });
	expect(budgets.listBudgets(ctx, { month: '2026-10' })).toHaveLength(source.length);
});
