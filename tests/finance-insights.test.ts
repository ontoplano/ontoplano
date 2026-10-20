import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());
const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };
const { load } = await import('../src/routes/finance/insights/+page.server');
function read(query: string) {
	return load({
		locals: { user: { id: OWNER } },
		url: new URL(`http://localhost/finance/insights?${query}`)
	} as never);
}

test('Insights uses selected month and original currency for every figure, with explicit balance gaps', async () => {
	const ledger = ledgers.createLedger(ctx, { name: 'Month source', currency: 'KES' });
	for (const [day, amount] of [
		['2026-09-30', -450000],
		['2026-10-01', -200000]
	] as const)
		statements.recordMovement(ctx, {
			ledgerId: ledger.id,
			occurredOn: day,
			amountCents: amount,
			description: 'Transport journey'
		});
	const september = await read(`month=2026-09&currency=KES`);
	expect(september).toMatchObject({
		currency: 'KES',
		month: '2026-09',
		window: { from: '2026-09-01', to: '2026-09-30', months: ['2026-09'] },
		report: { grossMinor: 450000, netMinor: 450000, unclassifiedCount: 1 },
		balanceCoverage: { verified: 0, total: 1 }
	});
	expect(september.totals).toMatchObject([{ month: '2026-09', outCents: 450000 }]);
	expect(september.slices).toMatchObject([{ outCents: 450000 }]);
	expect(september.byCategory.months).toEqual(['2026-09']);
	const empty = await read('month=2026-11&currency=KES');
	expect(empty.report).toBeNull();
	expect(empty.totals).toMatchObject([{ month: '2026-11', inCents: 0, outCents: 0 }]);
	const october = await read('month=2026-10&currency=KES');
	expect(october.report?.netMinor).toBe(200000);
});

test('Insights shares the selected full-month budget arithmetic but does not imply partial windows are monthly budgets', async () => {
	const budgets = await import('../src/lib/services/budgets');
	statements.createRule(ctx, { kind: 'category', name: 'Transport', pattern: 'Transport' });
	budgets.createBudget(ctx, {
		month: '2026-09',
		category: 'Transport',
		currency: 'KES',
		amountMinor: 600000
	});
	const september = await read('month=2026-09&currency=KES');
	expect(september.budgets).toMatchObject([
		{
			category: 'Transport',
			amountMinor: 600000,
			spentMinor: september.report?.netMinor,
			remainingMinor: 150000
		}
	]);
	const partial = await read('from=2026-09-15&to=2026-09-30&currency=KES');
	expect(partial.month).toBe('');
	expect(partial.budgets).toEqual([]);
});

test('the Insights review link lists only unclassified movements across the chosen currency and dates', async () => {
	const { load: review } = await import('../src/routes/finance/ledgers/+page.server');
	const first = ledgers.createLedger(ctx, { name: 'Review first', currency: 'EUR' });
	const second = ledgers.createLedger(ctx, { name: 'Review second', currency: 'EUR' });
	const dollar = ledgers.createLedger(ctx, { name: 'Not euros', currency: 'USD' });
	for (const ledgerId of [first.id, second.id, dollar.id])
		statements.recordMovement(ctx, {
			ledgerId,
			occurredOn: '2026-09-15',
			amountCents: -100,
			description: 'Review me'
		});
	const result = await review({
		locals: { user: { id: OWNER } },
		url: new URL(
			'http://localhost/finance/ledgers?unclassified=1&currency=EUR&from=2026-09-01&to=2026-09-30'
		)
	} as never);
	expect(result.reviewUnclassified).toBe(true);
	expect(result.movements.map((movement) => movement.ledgerId).sort()).toEqual(
		[first.id, second.id].sort()
	);
});
