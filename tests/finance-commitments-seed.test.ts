import { execFileSync } from 'node:child_process';
import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

test('dev seed includes every commitment kind, history, a conserved mixed movement and a transfer pair; replay adds nothing', () => {
	const seed = () =>
		execFileSync(process.execPath, ['scripts/seed-dev.mjs', database.path, 'owner@test.invalid'], {
			stdio: 'pipe'
		});
	seed();
	const stocks = () =>
		database.all('select * from finance_commitments where user_id = ? order by id', OWNER) as {
			kind: string;
		}[];
	expect(new Set(stocks().map((row) => row.kind))).toEqual(
		new Set(['custody', 'payable', 'receivable', 'reserve'])
	);
	const entries = () =>
		database.all('select * from finance_commitment_entries where user_id = ? order by id', OWNER);
	const parts = () =>
		database.all(
			'select * from finance_transaction_allocations where user_id = ? order by id',
			OWNER
		);
	expect(entries().length).toBeGreaterThan(0);
	expect(parts().length).toBeGreaterThan(1);
	expect(
		database.all(
			`select t.id from finance_transactions t join finance_transaction_allocations a on a.transaction_id = t.id
		where t.user_id = ? group by t.id having sum(a.amount_minor) != t.amount_cents`,
			OWNER
		)
	).toEqual([]);

	/*
	 * The transfer pair: two legs, two ledgers, one group, one currency, and an
	 * amount that cancels. A pair that did not cancel would be money created or
	 * lost, and the app refuses to make one, so the seed must not either.
	 */
	const legs = () =>
		database.all(
			"select * from finance_transactions where user_id = ? and kind = 'transfer' order by id",
			OWNER
		) as { ledger_id: number; group_id: string; amount_cents: number }[];
	const pair = legs();
	expect(pair).toHaveLength(2);
	const [out, into] = pair;
	expect(out.group_id).toBe(into.group_id);
	expect(out.ledger_id).not.toBe(into.ledger_id);
	expect(out.amount_cents).toBeLessThan(0);
	expect(out.amount_cents + into.amount_cents).toBe(0);
	expect(
		database.all(
			'select distinct currency from ledgers where user_id = ? and id in (?, ?)',
			OWNER,
			out.ledger_id,
			into.ledger_id
		)
	).toEqual([{ currency: 'KES' }]);

	const before = JSON.stringify([stocks(), entries(), parts(), legs()]);
	seed();
	expect(JSON.stringify([stocks(), entries(), parts(), legs()])).toBe(before);
}, 120_000);
