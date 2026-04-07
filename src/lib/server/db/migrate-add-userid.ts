import Database from 'better-sqlite3';
import { loadConfig, ensureDirectories } from '../config.js';

type IndexInfo = {
	name: string;
	unique: number;
};

type ColumnInfo = {
	name: string;
};

ensureDirectories();
const config = loadConfig();
const client = new Database(config.database.path);

const log: string[] = [];

const userRow = client.prepare('SELECT id FROM user LIMIT 1').get() as { id?: string } | undefined;
if (!userRow?.id) {
	throw new Error('No user found to assign user_id');
}

const userId = userRow.id;

const tables = [
	'activities',
	'weekly_slots',
	'task_instances',
	'diary_entries',
	'tags',
	'habits',
	'evidence',
	'beliefs'
];

for (const table of tables) {
	const columns = client.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
	const hasUserId = columns.some((column) => column.name === 'user_id');
	if (!hasUserId) {
		client.prepare(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`).run();
		log.push(`Added user_id column to ${table}.`);
	}

	client.prepare(`UPDATE ${table} SET user_id = ?`).run(userId);
	log.push(`Assigned user_id for ${table}.`);
}

const tagsIndexes = client.prepare("PRAGMA index_list('tags')").all() as IndexInfo[];
for (const index of tagsIndexes) {
	if (index.unique !== 1) continue;
	const columns = client.prepare(`PRAGMA index_info(${index.name})`).all() as ColumnInfo[];
	if (columns.length === 1 && columns[0]?.name === 'name') {
		try {
			client.prepare(`DROP INDEX IF EXISTS ${index.name}`).run();
			log.push(`Dropped tags unique index ${index.name}.`);
		} catch (error) {
			log.push(`Failed to drop tags unique index ${index.name}: ${(error as Error).message}`);
		}
	}
}

client
	.prepare('CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_unique ON tags (user_id, name)')
	.run();
log.push('Ensured unique index on tags(user_id, name).');

for (const line of log) {
	console.log(line);
}
