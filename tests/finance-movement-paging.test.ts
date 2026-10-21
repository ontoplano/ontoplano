import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

/*
 * A busy ledger is the normal case, not the edge.
 *
 * The paging refactor first shaped the whole list with one `IN (…ids…)` for its
 * allocations. SQLite binds one parameter per id, so a ledger past the
 * parameter ceiling (32,767 here) threw "too many SQL variables" — the
 * Ledgers room, `movements` and every drill-down died on exactly the accounts
 * that had the most history. A test here seeds 100,001 lines.
 */
const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const ledgers = await import('../src/lib/services/ledgers');
const statements = await import('../src/lib/services/statements');
const ctx = { userId: OWNER, tz: 'UTC', now: new Date('2026-10-19T12:00:00Z') };

test('the whole list and a bounded page work past the SQLite parameter ceiling', () => {
	const ledger = ledgers.createLedger(ctx, { name: 'Busy account', currency: 'KES' });
	database.exec(
		`with recursive n(x) as (select 1 union all select x+1 from n where x<40000)
		insert into finance_transactions (user_id,ledger_id,occurred_on,amount_cents,description,source,fingerprint)
		select ?,?,'2026-10-' || printf('%02d', 1 + (x % 28)),-x,'Busy line ' || x,'test','busy-' || x from n`,
		OWNER,
		ledger.id
	);

	expect(statements.listMovements(ctx, { limit: 3 })).toHaveLength(3);

	const first = statements.listMovementPage(ctx, { limit: 2 });
	expect(first.movements).toHaveLength(2);
	expect(first.nextCursor).not.toBeNull();
	const second = statements.listMovementPage(ctx, { limit: 2, beforeId: first.nextCursor! });
	expect(second.movements).toHaveLength(2);
	const ids = new Set([...first.movements, ...second.movements].map((row) => row.id));
	expect(ids.size).toBe(4);
	expect(second.nextCursor).not.toBe(first.nextCursor);
});
