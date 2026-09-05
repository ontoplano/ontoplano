/**
 * Promote an account to admin, from the box's own shell.
 *
 * The demo needed an operator — an account that watches sign-ups on /admin
 * and survives the hourly sweep — and there was no way to make one: the
 * first-account-is-owner rule was spent on a long-gone visitor, and every
 * other promotion happens on /admin, which only an admin reaches. This is
 * the bootstrap: register the account through the app (open registration for
 * the minute it takes, on the demo box), then, beside the deployed app:
 *
 *   DATABASE_URL=... node scripts/make-operator.mjs you@example.com
 *
 * Deliberately not a user-creating script: passwords are hashed by
 * better-auth in shapes this file should not reimplement, so the account is
 * made at the front door and only the role is granted here.
 */
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';

const email = process.argv[2];
if (!email || !email.includes('@')) {
	console.error('usage: node scripts/make-operator.mjs somebody@example.com');
	process.exit(1);
}

const path =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');
const db = new Database(path);

const row = db.prepare('select id, role from user where email = ?').get(email.toLowerCase());
if (!row) {
	console.error(`no account here uses ${email} — register it through the app first`);
	process.exit(1);
}
if (row.role === 'admin') {
	console.log(`${email} is already an admin`);
	process.exit(0);
}

db.prepare("update user set role = 'admin' where id = ?").run(row.id);
db.prepare(
	`insert into audit_events (user_id, event, detail, created_at)
	 values (?, 'role_changed', '{"to":"admin","reason":"make-operator"}', datetime('now'))`
).run(row.id);
console.log(`${email} is an admin now. Restart nothing; the next request sees it.`);
