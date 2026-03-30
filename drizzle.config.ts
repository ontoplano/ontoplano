import { defineConfig } from 'drizzle-kit';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dbPath =
	process.env.DATABASE_URL || join(homedir(), '.local', 'share', 'semotina', 'semotina.db');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: dbPath },
	verbose: true,
	strict: true
});
