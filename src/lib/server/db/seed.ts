import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { categories } from './schema.js';
import { loadConfig } from '../config.js';

const config = loadConfig();
const client = new Database(config.database.path);
const db = drizzle(client);

const existing = db.select().from(categories).all();
if (existing.length === 0) {
	console.log('No categories found (categories are now per-user, created on first login).');
} else {
	console.log(`${existing.length} categories exist.`);
}

console.log('Seed complete.');
client.close();
