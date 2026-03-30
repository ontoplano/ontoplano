import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { categories } from './schema.js';
import { loadConfig } from '../config.js';

const config = loadConfig();
const client = new Database(config.database.path);
const db = drizzle(client);

async function seed() {
	console.log('Seeding categories...');

	const existing = db.select().from(categories).all();
	if (existing.length === 0) {
		db.insert(categories)
			.values([{ name: 'duty' }, { name: 'skill' }, { name: 'money' }])
			.run();
		console.log('  ✓ Created: duty, skill, money');
	} else {
		console.log('  ✓ Categories already exist, skipping');
	}

	console.log('Seed complete.');
	client.close();
}

seed().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
