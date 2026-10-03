/**
 * What `/metrics` says about a request, and who may read it.
 *
 * The point is the split: a route's time, and how much of it was SQLite's.
 * So that is what is held here, with a real better-sqlite3 client.
 */
import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { measured, registry, statementShape, timeStatements } from '../src/lib/server/metrics';

const sample = async (name: string, labels: Record<string, string>) => {
	const metric = (await registry.getMetricsAsJSON()).find((one) => one.name === name);
	return metric?.values.find((one) =>
		Object.entries(labels).every(([key, value]) => one.labels[key] === value)
	)?.value;
};

describe('a statement', () => {
	test('is named by its shape, whatever its list length', () => {
		expect(statementShape('select *\n  from t where id in (?, ?, ?)')).toBe(
			'select * from t where id in (?…)'
		);
		expect(statementShape('select ? ')).toBe('select ?');
	});
});

describe('a request', () => {
	const client = new Database(':memory:');
	timeStatements(client);
	client.exec('create table t (n integer)');
	afterEach(() => client.exec('delete from t'));

	test('counts its SQL against its route', async () => {
		const { response, spent } = await measured('/things/[id]', 'GET', async () => {
			client.prepare('insert into t (n) values (?)').run(1);
			client.prepare('select n from t where n in (?, ?)').all(1, 2);
			return { status: 200 };
		});
		expect(response.status).toBe(200);
		expect(spent.statements).toBe(2);
		expect(spent.sqlSeconds).toBeGreaterThan(0);

		expect(
			await sample('ontoplano_http_request_sql_statements_total', {
				route: '/things/[id]',
				method: 'GET'
			})
		).toBe(2);
		expect(
			await sample('ontoplano_sql_statement_runs_total', {
				statement: 'select n from t where n in (?…)'
			})
		).toBe(1);
	});

	test('two at once keep their own count', async () => {
		const slow = (n: number) =>
			measured('/a', 'GET', async () => {
				for (let i = 0; i < n; i++) {
					client.prepare('insert into t (n) values (?)').run(i);
					await new Promise((done) => setTimeout(done, 1));
				}
				return { status: 200 };
			});
		const [one, three] = await Promise.all([slow(1), slow(3)]);
		expect(one.spent.statements).toBe(1);
		expect(three.spent.statements).toBe(3);
	});
});
