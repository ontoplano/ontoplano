import { afterAll, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { makeDatabase, OWNER, seedAccounts } from './helpers/db';

const directory = mkdtempSync(join(tmpdir(), 'finance-migration-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const root = join(import.meta.dirname, '..');

test('additive balance migration preserves history, old SQL remains usable, and the native snapshot restores', async () => {
	const path = join(directory, 'before.db');
	const db = new Database(path);
	for (const name of readdirSync(join(root, 'drizzle'))
		.filter((n) => n.endsWith('.sql') && n < '0124')
		.sort()) {
		db.exec(readFileSync(join(root, 'drizzle', name), 'utf8'));
	}
	seedAccounts(path);
	db.prepare(
		"insert into ledgers (id,user_id,name,currency) values (1,?,'Legacy account','KES')"
	).run(OWNER);
	db.prepare(
		"insert into finance_transactions (user_id,ledger_id,occurred_on,amount_cents,description,source,fingerprint) values (?,1,'2026-09-01',13262,'Synthetic legacy','manual','legacy-one')"
	).run(OWNER);
	const before = db.prepare('select * from finance_transactions').all();
	process.env.DATABASE_URL = path;
	const { snapshot } = await import('../scripts/db-snapshot.mjs');
	const backup = snapshot('pre-epic2');
	expect(backup).toBeTruthy();
	db.exec(readFileSync(join(root, 'drizzle', '0124_milky_goliath.sql'), 'utf8'));
	expect(db.prepare('select * from finance_transactions').all()).toEqual(before);
	expect(db.prepare('select opening_minor, opening_on from ledgers where id=1').get()).toEqual({
		opening_minor: 0,
		opening_on: null
	});
	// SQL used by the previous service still reads and writes without naming new columns.
	expect(
		db
			.prepare(
				'select sum(amount_cents) as total from finance_transactions where user_id=? and ledger_id=1'
			)
			.get(OWNER)
	).toEqual({ total: 13262 });
	db.prepare("insert into ledgers (user_id,name) values (?, 'Old writer')").run(OWNER);
	expect(
		db.prepare("select opening_minor,opening_on from ledgers where name='Old writer'").get()
	).toEqual({ opening_minor: 0, opening_on: null });
	expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
	db.close();
	const restored = new Database(backup!, { readonly: true });
	expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
	expect(restored.prepare('select * from finance_transactions').all()).toEqual(before);
	expect(
		(restored.pragma('table_info(ledgers)') as { name: string }[]).map((c) => c.name)
	).not.toContain('opening_on');
	restored.close();
});

test('development fixtures demonstrate all three evidence states and reseed without duplicate checks', () => {
	const data = makeDatabase();
	seedAccounts(data.path);
	try {
		execFileSync(process.execPath, ['scripts/seed-dev.mjs', data.path], {
			cwd: root,
			stdio: 'pipe'
		});
		const states = () =>
			data.all(
				"select l.name,l.opening_on,c.observed_minor from ledgers l left join finance_balance_checks c on c.ledger_id=l.id where l.name in ('Statement checked example','Opening declared example','Recorded only example') order by l.name"
			);
		const first = states();
		expect(first).toHaveLength(3);
		expect(first).toContainEqual({
			name: 'Statement checked example',
			opening_on: '2026-09-01',
			observed_minor: 13262
		});
		expect(first).toContainEqual({
			name: 'Recorded only example',
			opening_on: null,
			observed_minor: null
		});
		execFileSync(process.execPath, ['scripts/seed-dev.mjs', data.path], {
			cwd: root,
			stdio: 'pipe'
		});
		expect(states()).toEqual(first);
	} finally {
		data.remove();
	}
}, 60000);
