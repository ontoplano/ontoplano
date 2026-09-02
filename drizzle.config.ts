import { defineConfig } from 'drizzle-kit';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dbPath =
	process.env.DATABASE_URL ||
	join(
		// The same override the server honours, so a packaged instance migrates
		// the database it is actually going to open rather than one under the
		// service account's home.
		process.env.ONTOPLANO_DATA_DIR || join(homedir(), '.local', 'share', 'ontoplano'),
		'ontoplano.db'
	);

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url: dbPath },
	verbose: true,
	strict: true
});
