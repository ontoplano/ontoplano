#!/usr/bin/env node
/**
 * Restore an exported account, from a shell.
 *
 *   npx tsx scripts/import-account.ts <export.json> <email>
 *   make db-import FILE=export.json EMAIL=you@example.com
 *
 * The same thing Settings → Account → Restore an export does, for the times
 * when a browser is the wrong tool: an export of a year's use is megabytes, and
 * a proxy with a body limit will refuse it long before the app sees it. On the
 * box, this reads the file off the disk and there is no request to be too big.
 *
 * It **replaces** the named account's data, in one transaction. There is no
 * merge, and no undo — take a snapshot first (`make db-snapshot`), which is one
 * command and turns a mistake into a five-second recovery.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [file, email] = process.argv.slice(2);

if (!file || !email) {
	console.error('Usage: npx tsx scripts/import-account.ts <export.json> <email>');
	console.error('  The account is found by email, and everything in it is replaced.');
	process.exit(1);
}

if (!existsSync(file)) {
	console.error(`No such file: ${file}`);
	process.exit(1);
}

const database =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');

if (!existsSync(database)) {
	console.error(`No database at ${database}. Set DATABASE_URL if it is somewhere else.`);
	process.exit(1);
}

// Imported after DATABASE_URL is known to be right: the connection is opened at
// module scope, so a bad path here would fail deep inside drizzle instead.
process.env.DATABASE_URL = database;

const { default: Database } = await import('better-sqlite3');
const probe = new Database(database, { readonly: true });
const account = probe.prepare('select id, email from user where email = ?').get(email) as
	| { id: string; email: string }
	| undefined;
probe.close();

if (!account) {
	console.error(`No account with the address ${email} on this instance.`);
	process.exit(1);
}

const { importAccount } = await import('../src/lib/server/services/account-import.js');

console.log(`Replacing everything in ${account.email} with ${file}`);
const result = importAccount(account.id, readFileSync(file, 'utf8'));

console.log(`\n${result.total} rows in.`);
for (const table of result.tables.slice(0, 12)) {
	console.log(`  ${String(table.rows).padStart(6)}  ${table.name}`);
}
if (result.tables.length > 12) console.log(`  …and ${result.tables.length - 12} more tables`);

if (result.skipped.length > 0) {
	console.log('\nLeft behind:');
	for (const skip of result.skipped) console.log(`  ${skip.name} (${skip.rows}) — ${skip.why}`);
}
