import { execFileSync } from 'node:child_process';
import { afterAll, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

test('dev seed includes every commitment kind, history and a conserved mixed movement; replay adds nothing', () => {
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
	const before = JSON.stringify([stocks(), entries(), parts()]);
	seed();
	expect(JSON.stringify([stocks(), entries(), parts()])).toBe(before);
}, 120_000);
