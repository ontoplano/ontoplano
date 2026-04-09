/**
 * Migration: Make categories user-scoped.
 *
 * This script:
 * 1. Creates a new categories table with userId, color, colorLight columns
 * 2. For each existing user, creates 3 categories (duty, skill, money) with default colors
 * 3. Remaps activities and weekly_slots to point to the new per-user category IDs
 * 4. Drops the old table and renames the new one
 *
 * Run with: npx tsx src/lib/server/db/migrate-categories.ts
 */
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';

const config = loadConfig();
const client = new Database(config.database.path);

const DEFAULT_CATEGORIES = [
	{ name: 'duty', color: '#3b82f6', colorLight: '#dbeafe' },
	{ name: 'skill', color: '#22c55e', colorLight: '#dcfce7' },
	{ name: 'money', color: '#f59e0b', colorLight: '#fef3c7' }
];

function migrate() {
	console.log('Starting categories migration...');
	console.log(`Database: ${config.database.path}`);

	// Check current state
	const oldCategories = client.prepare('SELECT * FROM categories').all() as {
		id: number;
		name: string;
	}[];
	console.log(`Found ${oldCategories.length} existing categories:`, oldCategories);

	const users = client.prepare('SELECT id FROM user').all() as { id: string }[];
	console.log(`Found ${users.length} users`);

	if (users.length === 0) {
		console.log('No users found. Will create table with new schema only.');
	}

	// Build a mapping: oldCategoryId → categoryName
	const oldIdToName: Record<number, string> = {};
	for (const cat of oldCategories) {
		oldIdToName[cat.id] = cat.name;
	}

	client.exec('PRAGMA foreign_keys = OFF');

	const tx = client.transaction(() => {
		// 1. Create new table
		client.exec(`
			CREATE TABLE categories_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id TEXT NOT NULL REFERENCES user(id),
				name TEXT NOT NULL,
				color TEXT NOT NULL DEFAULT '#6b7280',
				color_light TEXT NOT NULL DEFAULT '#f3f4f6'
			)
		`);

		client.exec(`CREATE INDEX categories_new_user_idx ON categories_new(user_id)`);
		client.exec(
			`CREATE UNIQUE INDEX categories_new_user_name_unique ON categories_new(user_id, name)`
		);

		// 2. For each user, create their categories and remap references
		const insertCat = client.prepare(
			'INSERT INTO categories_new (user_id, name, color, color_light) VALUES (?, ?, ?, ?)'
		);

		// Map: { userId: { oldCatName: newCatId } }
		const remapping: Record<string, Record<string, number>> = {};

		for (const user of users) {
			remapping[user.id] = {};
			for (const cat of DEFAULT_CATEGORIES) {
				const result = insertCat.run(user.id, cat.name, cat.color, cat.colorLight);
				remapping[user.id][cat.name] = Number(result.lastInsertRowid);
			}
		}

		// 3. Remap activities.category_id
		const userActivities = client
			.prepare('SELECT id, user_id, category_id FROM activities')
			.all() as { id: number; user_id: string; category_id: number }[];

		const updateActivity = client.prepare('UPDATE activities SET category_id = ? WHERE id = ?');

		for (const act of userActivities) {
			const catName = oldIdToName[act.category_id];
			if (!catName) {
				console.warn(`Activity ${act.id} has unknown category_id ${act.category_id}, skipping`);
				continue;
			}
			const userRemap = remapping[act.user_id];
			if (!userRemap) {
				console.warn(`Activity ${act.id} belongs to unknown user ${act.user_id}, skipping`);
				continue;
			}
			const newCatId = userRemap[catName];
			if (newCatId) {
				updateActivity.run(newCatId, act.id);
			}
		}

		// 4. Remap weekly_slots.category_id
		const userSlots = client
			.prepare('SELECT id, user_id, category_id FROM weekly_slots WHERE category_id IS NOT NULL')
			.all() as { id: number; user_id: string; category_id: number }[];

		const updateSlot = client.prepare('UPDATE weekly_slots SET category_id = ? WHERE id = ?');

		for (const slot of userSlots) {
			const catName = oldIdToName[slot.category_id];
			if (!catName) continue;
			const userRemap = remapping[slot.user_id];
			if (!userRemap) continue;
			const newCatId = userRemap[catName];
			if (newCatId) {
				updateSlot.run(newCatId, slot.id);
			}
		}

		// 5. Drop old, rename new
		client.exec('DROP TABLE categories');
		client.exec('ALTER TABLE categories_new RENAME TO categories');

		console.log('Migration complete.');
		console.log(
			'New category count:',
			client.prepare('SELECT COUNT(*) as cnt FROM categories').get()
		);
	});

	try {
		tx();
	} finally {
		client.exec('PRAGMA foreign_keys = ON');
	}

	client.close();
}

migrate();
