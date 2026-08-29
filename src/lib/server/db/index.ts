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

assertMigrated(client, config.database.path);

export const db = drizzle(client, { schema });
