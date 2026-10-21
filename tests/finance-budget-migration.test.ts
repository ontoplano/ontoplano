import { afterAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';
const root = join(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'budget-migration-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test('budget migration preserves old history and the native pre-migration snapshot restores', async () => {
	const path = join(directory, 'before.db');
	const db = new Database(path);
	// A scratch file: replaying every migration with fsync on is most of a minute.
	db.pragma('synchronous = OFF');
	for (const name of readdirSync(join(root, 'drizzle'))
		.filter((name) => name.endsWith('.sql') && name < '0125')
		.sort())
		db.exec(readFileSync(join(root, 'drizzle', name), 'utf8'));
	seedAccounts(path);
	db.prepare("insert into ledgers(user_id,name,currency) values (?,'Legacy source','KES')").run(
		OWNER
	);
	db.prepare(
		"insert into finance_transactions(user_id,ledger_id,occurred_on,amount_cents,description,source,fingerprint) values (?,1,'2026-09-01',1200,'Synthetic legacy','manual','legacy')"
	).run(OWNER);
	const before = db.prepare('select * from finance_transactions').all();
	process.env.DATABASE_URL = path;
	const { snapshot } = await import('../scripts/db-snapshot.mjs');
	const backup = snapshot('pre-finance');
	expect(backup).toBeTruthy();
	db.exec(
		readFileSync(
			join(root, 'drizzle', '0125_finance_openings_commitments_splits_and_budgets.sql'),
			'utf8'
		)
	);
	expect(db.prepare('select * from finance_transactions').all()).toMatchObject(before);
	db.prepare("insert into ledgers(user_id,name) values (?,'Old writer still works')").run(OWNER);
	expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
	db.close();
	const restored = new Database(backup!, { readonly: true });
	expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
	expect(restored.prepare('select * from finance_transactions').all()).toEqual(before);
	expect(
		restored.prepare("select name from sqlite_master where name='finance_budgets'").get()
	).toBeUndefined();
	restored.close();
});

test('synthetic monthly budgets and refund credits seed idempotently without changing existing ceilings', () => {
	const data = makeDatabase();
	seedAccounts(data.path);
	try {
		const seed = () =>
			execFileSync(process.execPath, ['scripts/seed-dev.mjs', data.path], {
				cwd: root,
				stdio: 'pipe'
			});
		seed();
		const rows = () =>
			data.all(
				"select month,category,currency,amount_minor from finance_budgets where category='Transport' and currency='KES' order by month"
			);
		expect(rows()).toEqual([
			{ month: '2026-09', category: 'Transport', currency: 'KES', amount_minor: 600000 },
			{ month: '2026-10', category: 'Transport', currency: 'KES', amount_minor: 600000 }
		]);
		data.exec("update finance_budgets set amount_minor=123 where month='2026-10'");
		seed();
		expect(rows()).toHaveLength(2);
		expect(rows()[1]).toMatchObject({ amount_minor: 123 });
	} finally {
		data.remove();
	}
}, 60000);
