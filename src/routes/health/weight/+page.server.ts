import type { PageServerLoad } from './$types';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';

const WEIGHTS_DB_PATH = join(
	process.env.HOME ?? '/home/you',
	'.local/share/a-private-plugin/weights.db'
);

interface WeightRow {
	timestamp: string;
	weight_kg: number;
}

export const load: PageServerLoad = async () => {
	if (!existsSync(WEIGHTS_DB_PATH)) {
		return { weights: [] as { date: string; weight: number }[] };
	}

	const weightsDb = new Database(WEIGHTS_DB_PATH, { readonly: true });
	const rows = weightsDb
		.prepare('SELECT timestamp, weight_kg FROM weights ORDER BY timestamp ASC')
		.all() as WeightRow[];
	weightsDb.close();

	const weights = rows.map((r) => ({
		date: r.timestamp.slice(0, 10),
		weight: r.weight_kg
	}));

	return { weights };
};
