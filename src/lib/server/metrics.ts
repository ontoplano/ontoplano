/**
 * What this process is doing, in numbers anything that speaks Prometheus can
 * collect — on a served instance, VictoriaMetrics on the same box.
 *
 * The questions it exists to answer, at the moment somebody is looking at a
 * box with the app on 60% CPU: which route is it, how often is it asked, how
 * long does it take — and is the time in SQLite or in the code around it?
 *
 * - The process's own: CPU seconds, memory, the event loop's lag, GC
 *   (`prom-client`'s defaults — the standard names every dashboard knows).
 * - Every request: its duration by route, method and status.
 * - How much of each request was SQL, by route. SQLite is synchronous here,
 *   so a statement's time is the process's time; a route whose SQL share is
 *   small and whose duration is large is spending it in TypeScript.
 * - Every statement shape: how often it runs and for how long, so the slow
 *   one is named rather than inferred.
 *
 * A route is SvelteKit's route id — `/notebooks/[id]` — never a path, so the
 * number of series stays the number of routes. A statement is its SQL with
 * runs of placeholders folded, so an `IN (?, ?, ?)` of any length is one.
 * Nothing here carries a user, a value or an address.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import type Database from 'better-sqlite3';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { onlineCount } from './presence.js';
import { openStreams } from './live.js';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

/** Seconds a request can take, as buckets: from a cached page to a stuck one. */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];
/** How much of a statement is kept as its name. Enough to recognise it. */
const STATEMENT_LABEL_LENGTH = 200;

const requestSeconds = new Histogram({
	name: 'ontoplano_http_request_duration_seconds',
	help: 'Time to answer a request, by route.',
	labelNames: ['route', 'method', 'status'],
	buckets: DURATION_BUCKETS,
	registers: [registry]
});

const requestSqlSeconds = new Counter({
	name: 'ontoplano_http_request_sql_seconds_total',
	help: 'Time spent in SQLite while answering requests, by route.',
	labelNames: ['route', 'method'],
	registers: [registry]
});

const requestSqlStatements = new Counter({
	name: 'ontoplano_http_request_sql_statements_total',
	help: 'SQL statements run while answering requests, by route.',
	labelNames: ['route', 'method'],
	registers: [registry]
});

const statementSeconds = new Counter({
	name: 'ontoplano_sql_statement_seconds_total',
	help: 'Time spent running each statement shape.',
	labelNames: ['statement'],
	registers: [registry]
});

const statementRuns = new Counter({
	name: 'ontoplano_sql_statement_runs_total',
	help: 'How often each statement shape ran.',
	labelNames: ['statement'],
	registers: [registry]
});

/*
 * Who is here: accounts seen in the last five minutes (`$lib/server/presence`)
 * and tabs holding a live stream open. Read at scrape time, so they cost
 * nothing between scrapes.
 */
new Gauge({
	name: 'ontoplano_users_online',
	help: 'Accounts that made a request in the last five minutes.',
	registers: [registry],
	collect() {
		this.set(onlineCount());
	}
});

new Gauge({
	name: 'ontoplano_live_streams',
	help: 'Tabs holding a live stream open.',
	registers: [registry],
	collect() {
		this.set(openStreams());
	}
});

/** What one request has spent in SQL so far. */
type Spent = { sqlSeconds: number; statements: number };
const spending = new AsyncLocalStorage<Spent>();

/** A statement's name: its SQL, one line, placeholders folded, cut short. */
export function statementShape(sql: string): string {
	return sql
		.replace(/\s+/g, ' ')
		.replace(/\?(\s*,\s*\?)+/g, '?…')
		.trim()
		.slice(0, STATEMENT_LABEL_LENGTH);
}

/** The methods of a better-sqlite3 statement that actually run it. */
const RUNS = ['run', 'get', 'all', 'iterate'] as const;

/**
 * Time every statement this client runs.
 *
 * `prepare` is where every statement comes from — drizzle's included — so
 * wrapping it is the whole of it. The prepared statement's own methods are
 * replaced on the instance; the chainable ones (`raw`, `pluck`) return the
 * same object, so they keep the timing.
 */
export function timeStatements(client: Database.Database): void {
	const prepare = client.prepare.bind(client);
	client.prepare = ((source: string) => {
		const statement = prepare(source);
		const shape = statementShape(source);
		for (const method of RUNS) {
			const original = (statement as unknown as Record<string, (...args: unknown[]) => unknown>)[
				method
			].bind(statement);
			(statement as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
				const started = performance.now();
				try {
					return original(...args);
				} finally {
					const seconds = (performance.now() - started) / 1000;
					statementSeconds.inc({ statement: shape }, seconds);
					statementRuns.inc({ statement: shape });
					const spent = spending.getStore();
					if (spent) {
						spent.sqlSeconds += seconds;
						spent.statements += 1;
					}
				}
			};
		}
		return statement;
	}) as typeof client.prepare;
}

/**
 * Answer a request with its time and its SQL counted.
 *
 * Returns what the request spent, for the log line beside the numbers.
 */
export async function measured<T extends { status: number }>(
	route: string,
	method: string,
	answer: () => T | Promise<T>
): Promise<{ response: T; seconds: number; spent: Spent }> {
	const spent: Spent = { sqlSeconds: 0, statements: 0 };
	const started = performance.now();
	const response = await spending.run(spent, async () => answer());
	const seconds = (performance.now() - started) / 1000;
	requestSeconds.observe({ route, method, status: String(response.status) }, seconds);
	requestSqlSeconds.inc({ route, method }, spent.sqlSeconds);
	requestSqlStatements.inc({ route, method }, spent.statements);
	return { response, seconds, spent };
}
