/**
 * Make an admin account, from the box's own shell.
 *
 * The demo needed an operator — an account that watches sign-ups on /admin
 * and survives the hourly sweep — and there was no way to make one: the
 * first-account-is-owner rule was spent on a long-gone visitor, and every
 * other promotion happens on /admin, which only an admin reaches. This is
 * the bootstrap, beside the deployed app:
 *
 *   DATABASE_URL=... node scripts/make-operator.mjs you@example.com
 *
 * An existing account is promoted; a missing one is created — the password
 * asked for without echo, hashed by the same better-auth the app runs, so
 * the front door accepts it. Nothing to open, nothing to revert.
 */
import Database from 'better-sqlite3';
import { generateRandomString, hashPassword } from 'better-auth/crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MIN_PASSWORD_LENGTH = 8;

const email = process.argv[2];
if (!email || !email.includes('@')) {
	console.error('usage: node scripts/make-operator.mjs somebody@example.com');
	process.exit(1);
}

const path =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'ontoplano', 'ontoplano.db');
const db = new Database(path);

const id = () => generateRandomString(32, 'a-z', 'A-Z', '0-9');
const audit = (userId, event) =>
	db
		.prepare(
			`insert into audit_events (user_id, event, detail, created_at)
			 values (?, ?, '{"to":"admin","reason":"make-operator"}', datetime('now'))`
		)
		.run(userId, event);

/** The password, asked for on the terminal without echo — or piped in. */
async function askPassword() {
	if (!process.stdin.isTTY) {
		const chunks = [];
		for await (const chunk of process.stdin) chunks.push(chunk);
		return Buffer.concat(chunks).toString().split('\n')[0].trim();
	}
	process.stderr.write(`a password for ${email} (not shown): `);
	process.stdin.setRawMode(true);
	process.stdin.resume();
	return new Promise((resolve) => {
		let typed = '';
		const onData = (key) => {
			const s = key.toString();
			if (s === '\r' || s === '\n') {
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.off('data', onData);
				process.stderr.write('\n');
				resolve(typed);
			} else if (s === '\x03') {
				process.stderr.write('\n');
				process.exit(130);
			} else if (s === '\x7f' || s === '\b') {
				typed = typed.slice(0, -1);
			} else {
				typed += s;
			}
		};
		process.stdin.on('data', onData);
	});
}

const row = db.prepare('select id, role from user where email = ?').get(email.toLowerCase());

if (row) {
	if (row.role === 'admin') {
		console.log(`${email} is already an admin`);
		process.exit(0);
	}
	db.prepare("update user set role = 'admin' where id = ?").run(row.id);
	audit(row.id, 'role_changed');
	console.log(`${email} is an admin now. Restart nothing; the next request sees it.`);
	process.exit(0);
}

const password = await askPassword();
if (password.length < MIN_PASSWORD_LENGTH) {
	console.error(`a password needs at least ${MIN_PASSWORD_LENGTH} characters — nothing was made`);
	process.exit(1);
}

const now = Date.now();
const userId = id();
const hash = await hashPassword(password);
db.transaction(() => {
	db.prepare(
		`insert into user (id, name, email, email_verified, created_at, updated_at, role)
		 values (?, ?, ?, 1, ?, ?, 'admin')`
	).run(userId, email.split('@')[0], email.toLowerCase(), now, now);
	db.prepare(
		`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		 values (?, ?, 'credential', ?, ?, ?, ?)`
	).run(id(), userId, userId, hash, now, now);
	audit(userId, 'operator_created');
})();
console.log(`${email} is an admin now — sign in at /login with the password you just typed.`);
