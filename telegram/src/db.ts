import Database from 'better-sqlite3';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { ensureDirectories, loadConfig } from '../../src/lib/server/config.js';
import * as schema from '../../src/lib/server/db/schema.js';

ensureDirectories();

const config = loadConfig();
const client = new Database(config.database.path);

client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

export const db = drizzle(client, { schema });

/**
 * The account this instance belongs to.
 *
 * Only meaningful on a self-hosted box, which is why `index.ts` refuses to
 * start anywhere else: with more than one account on the instance, "the first
 * user" is an arbitrary answer to a question about somebody's private data.
 */
export async function getPrimaryUserId(): Promise<string> {
	const firstUser = db
		.select({ id: schema.user.id })
		.from(schema.user)
		.orderBy(asc(schema.user.createdAt))
		.get();

	if (!firstUser) {
		throw new Error('No Ontoplano user found in the database');
	}

	return firstUser.id;
}
