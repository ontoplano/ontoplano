import { afterAll, afterEach, expect, test, vi } from 'vitest';

/*
 * The overview is one screen reading one set of aggregates (D11).
 *
 * `listMovements` evaluates every category and tag rule per row and slices to
 * a cap, so a page built on it would report the first thousand lines and call
 * it a month. This test fails if the page load reaches it at all: the module
 * is replaced with one whose `listMovements` throws, and everything else the
 * page needs stays real.
 */
vi.mock('../src/lib/services/statements', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/services/statements')>();
	return {
		...actual,
		listMovements: vi.fn(() => {
			throw new Error('the money overview must not read rows through listMovements (D11)');
		})
	};
});

import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const database = makeDatabase();
afterEach(() => vi.useRealTimers());
seedAccounts(database.path);
afterAll(() => database.remove());

const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const commitments = await import('../src/lib/services/commitments');
const budgets = await import('../src/lib/services/budgets');
const { load } = await import('../src/routes/finance/+page.server');

const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };

test('a page load never reads a statement through listMovements', async () => {
	const ledger = ledgers.createLedger(ctx, {
		name: 'Overview source',
		currency: 'KES',
		openingOn: '2026-09-01',
		openingMinor: 100000
	});
	statements.recordMovement(ctx, {
		ledgerId: ledger.id,
		occurredOn: '2026-10-02',
		amountCents: -2500,
		description: 'Overview expense'
	});
	commitments.createCommitment(ctx, {
		kind: 'reserve',
		name: 'Overview reserve',
		currency: 'KES',
		openingMinor: 10000
	});
	statements.createRule(ctx, { kind: 'category', name: 'Overview', pattern: 'Overview' });
	budgets.createBudget(ctx, {
		month: '2026-10',
		category: 'Overview',
		currency: 'KES',
		amountMinor: 50000
	});

	const data = await load({
		locals: { user: { id: OWNER } },
		url: new URL('http://localhost/finance?month=2026-10')
	} as never);

	const kes = data.overview.currencies.find(
		(picture: { currency: string | null }) => picture.currency === 'KES'
	);
	if (!kes) throw new Error('the overview has no KES picture');
	expect(kes).toMatchObject({
		fundsMinor: 97500,
		availableMinor: 87500,
		reservesMinor: 10000
	});
	expect(kes.spending).toMatchObject({ grossMinor: 2500, netMinor: 2500, movementCount: 1 });
	expect(kes.budgets).toMatchObject([{ category: 'Overview', remainingMinor: 47500 }]);
	// The default month is the account's civil month, not the box's: a clock
	// pinned here proves the loader takes it from the request's now, not the
	// month the test happens to run in.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-11-02T12:00:00Z'));
	const fallback = await load({
		locals: { user: { id: OWNER } },
		url: new URL('http://localhost/finance')
	} as never);
	expect(fallback.overview.month).toBe('2026-11');
	expect(fallback.overview.asOf).toBe('2026-11-02');
});

test('neither the overview service nor its loader names listMovements', () => {
	for (const file of ['src/lib/services/finance-summary.ts', 'src/routes/finance/+page.server.ts'])
		expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toMatch(/\blistMovements\b/);
});
