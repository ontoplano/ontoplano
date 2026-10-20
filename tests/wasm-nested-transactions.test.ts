import Database from 'better-sqlite3';
import { afterAll, expect, test } from 'vitest';
import { wasmClient } from '../src/lib/isolated/wasm-client';

// Exercise the OO1 adapter's transaction SQL against a real SQLite engine.
const sqlite = new Database(':memory:');
sqlite.exec('create table evidence (name text not null)');
afterAll(() => sqlite.close());
const client = wasmClient({
	prepare: (sql) => sqlite.prepare(sql) as never,
	exec: (sql) => {
		sqlite.exec(typeof sql === 'string' ? sql : sql.sql);
	},
	selectValue: (sql) => sqlite.prepare(sql).pluck().get(),
	changes: () => 0
});
const names = () => sqlite.prepare('select name from evidence order by rowid').pluck().all();
const add = (name: string) => sqlite.prepare('insert into evidence values (?)').run(name);

for (const mode of ['deferred', 'immediate', 'exclusive']) {
	test(`nested ${mode} writes commit as one transaction`, () => {
		sqlite.exec('delete from evidence');
		client
			.transaction(() => {
				add('outer');
				client.transaction(() => add('inner'))[mode]();
			})
			[mode]();
		expect(names()).toEqual(['outer', 'inner']);
	});
}

test('a caught inner rollback retains outer writes and allows another nested transaction', () => {
	sqlite.exec('delete from evidence');
	client
		.transaction(() => {
			add('outer');
			expect(() =>
				client
					.transaction(() => {
						add('discard inner');
						client.transaction(() => add('discard deeper')).deferred();
						throw new Error('inner refused');
					})
					.deferred()
			).toThrow('inner refused');
			client.transaction(() => add('kept later')).deferred();
		})
		.deferred();
	expect(names()).toEqual(['outer', 'kept later']);
});

test('outer rollback removes released inner writes and resets the adapter for reuse', () => {
	sqlite.exec('delete from evidence');
	expect(() =>
		client
			.transaction(() => {
				add('discard outer');
				client.transaction(() => add('discard inner')).deferred();
				throw new Error('outer refused');
			})
			.deferred()
	).toThrow('outer refused');
	expect(names()).toEqual([]);
	client.transaction(() => add('fresh')).immediate();
	expect(names()).toEqual(['fresh']);
});
