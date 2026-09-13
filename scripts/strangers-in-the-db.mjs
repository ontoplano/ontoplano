#!/usr/bin/env node
/**
 * How many accounts in a database are not the dev one.
 *
 * `make reset-dev` replaces a whole database with a fresh one, and the only
 * database that is safe to do that to is the one this project seeds: it has a
 * single account, `dev@ontoplano.test`. Anything else is somebody's data, and
 * on a server it is everybody's.
 *
 * Prints a count and nothing else — no addresses. What the caller needs is
 * "is this yours to throw away", and the answer to that is a number.
 *
 *   node scripts/strangers-in-the-db.mjs [path/to.db]
 *
 * Opened read-only. A database with no account table has never been used and
 * counts as nothing to lose; one that cannot be opened counts as unknown,
 * which the caller treats as "do not touch".
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEV_ACCOUNT = 'dev@ontoplano.test';

const path =
	process.argv[2] ||
	process.env.DATABASE_URL ||
	join(homedir(), '.local/share/ontoplano/ontoplano.db');

if (!existsSync(path)) {
	console.log('0');
	process.exit(0);
}

const db = new Database(path, { readonly: true, fileMustExist: true });
try {
	const table = db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'")
		.get();
	if (!table) {
		console.log('0');
		process.exit(0);
	}

	const { n } = db.prepare('SELECT count(*) AS n FROM user WHERE email != ?').get(DEV_ACCOUNT);
	console.log(String(n));
} finally {
	db.close();
}
