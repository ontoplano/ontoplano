/**
 * The dev account, with a password everybody knows.
 *
 *   DATABASE_URL=... node scripts/dev-account.mjs dev@ontoplano.test ontoplano-dev
 *
 * Creates the account when it is missing and resets its password when it is
 * not, so a dev database that has been through other hands still opens with
 * the documented pair. The hash is better-auth's own, from the copy in
 * node_modules — this runs on a checkout, never on a box. `make dev-local`
 * is the caller.
 */
import Database from 'better-sqlite3';
import { hashPassword } from 'better-auth/crypto';
import { randomBytes } from 'node:crypto';

const MIN_PASSWORD_LENGTH = 8;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const id = () => Array.from(randomBytes(32), (b) => ALPHABET[b % ALPHABET.length]).join('');

const [email, password] = process.argv.slice(2);
const path = process.env.DATABASE_URL;
if (!path || !email?.includes('@') || !password) {
	console.error('usage: DATABASE_URL=<db> node scripts/dev-account.mjs <email> <password>');
	process.exit(1);
}
if (password.length < MIN_PASSWORD_LENGTH) {
	console.error(`a password needs at least ${MIN_PASSWORD_LENGTH} characters`);
	process.exit(1);
}

const db = new Database(path);
const address = email.toLowerCase();
const hash = await hashPassword(password);
const now = Date.now();

const made = db.transaction(() => {
	const user = db.prepare('select id from user where email = ?').get(address);
	if (!user) {
		const userId = id();
		db.prepare(
			`insert into user (id, name, email, email_verified, created_at, updated_at, role)
			 values (?, ?, ?, 1, ?, ?, 'admin')`
		).run(userId, address.split('@')[0], address, now, now);
		db.prepare(
			`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
			 values (?, ?, 'credential', ?, ?, ?, ?)`
		).run(id(), userId, userId, hash, now, now);
		return 'created';
	}
	const changed = db
		.prepare(
			`update account set password = ?, updated_at = ?
			 where user_id = ? and provider_id = 'credential'`
		)
		.run(hash, now, user.id).changes;
	if (changed === 0) {
		db.prepare(
			`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
			 values (?, ?, 'credential', ?, ?, ?, ?)`
		).run(id(), user.id, user.id, hash, now, now);
	}
	return 'password reset';
})();

console.log(`${address}: ${made}`);
