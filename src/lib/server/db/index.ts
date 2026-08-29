import { building } from '$app/environment';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import { loadConfig, ensureDirectories } from '../config.js';
import { assertMigrated } from './assert-migrated.js';

ensureDirectories();
const config = loadConfig();
const client = new Database(config.database.path);

client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

// A server about to serve must be migrated; a BUILD must not care. `vite
// build` loads this module on whatever machine is building, and that
// machine's database — a laptop's dev copy, usually — is allowed to be
// behind the migration that is being shipped. Deploy migrates the server
// itself before restarting it; nobody migrates by hand.
if (!building) assertMigrated(client, config.database.path);

export const db = drizzle(client, { schema });
