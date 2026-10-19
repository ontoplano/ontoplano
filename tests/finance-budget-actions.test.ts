import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const { createLedger } = await import('../src/lib/services/ledgers');
const { createRule } = await import('../src/lib/services/statements');
const budgets = await import('../src/lib/services/budgets');
const { actions } = await import('../src/routes/finance/budgets/+page.server');
const ctx = { userId: OWNER, now: new Date('2026-10-19T12:00:00Z'), tz: 'UTC' };
createLedger(ctx, { name: 'Action KES', currency: 'KES' });
createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'ride' });
function event(values: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) body.set(key, value);
	return {
		locals: { user: { id: OWNER } },
		request: new Request('http://localhost/finance/budgets', { method: 'POST', body })
	};
}
test('a partial budget form update retains currency precision and detects stale forms', async () => {
	const row = budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 1000
	});
	expect(
		await actions.update(event({ id: String(row.id), amount: '20.00', updatedAt: row.updatedAt }))
	).toMatchObject({ success: true });
	expect(budgets.getBudget(ctx, row.id).amountMinor).toBe(2000);
	const stale = await actions.update(
		event({ id: String(row.id), amount: '30.00', updatedAt: row.updatedAt })
	);
	expect(stale).toMatchObject({ status: 409 });
	expect(budgets.getBudget(ctx, row.id).amountMinor).toBe(2000);
});

test('creating from another month moves the list to the budget that was made', async () => {
	let thrown: unknown;
	try {
		await actions.create(
			event({
				month: '2026-11',
				category: 'Transport',
				currency: 'KES',
				amount: '30.00',
				viewMonth: '2026-10',
				viewCurrency: 'EUR'
			})
		);
	} catch (error) {
		thrown = error;
	}
	expect(thrown).toMatchObject({
		status: 303,
		location: '/finance/budgets?month=2026-11&currency=KES'
	});
});

test('a category made from the budget dialog is saved as a normal rule', async () => {
	const { listRules } = await import('../src/lib/services/statements');
	expect(await actions.createCategory(event({ categoryName: 'Inline category' }))).toMatchObject({
		category: 'Inline category'
	});
	expect(
		listRules(ctx)
			.filter((rule) => rule.kind === 'category')
			.map((rule) => rule.name)
	).toContain('Inline category');
});
