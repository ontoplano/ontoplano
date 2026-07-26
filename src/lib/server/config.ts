import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const home = homedir();
export const CONFIG_DIR = join(home, '.config', 'ontoplano');
export const DATA_DIR = join(home, '.local', 'share', 'ontoplano');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.toml');
export const DB_PATH = join(DATA_DIR, 'ontoplano.db');

function parseToml(content: string): Record<string, Record<string, string>> {
	const result: Record<string, Record<string, string>> = {};
	let currentSection = '';

	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const sectionMatch = line.match(/^\[(.+)]$/);
		if (sectionMatch) {
			currentSection = sectionMatch[1];
			result[currentSection] = result[currentSection] || {};
			continue;
		}

		const kvMatch = line.match(/^(\w+)\s*=\s*"?([^"]*)"?$/);
		if (kvMatch) {
			const [, key, value] = kvMatch;
			if (currentSection) {
				result[currentSection][key] = value;
			} else {
				result[key] = value as unknown as Record<string, string>;
			}
		}
	}

	return result;
}

const DEFAULT_CONFIG = `[server]
host = "0.0.0.0"
port = "1493"

[database]

[week]
first_day = "0"
generate_day = "6"
`;

export interface OntoplanoConfig {
	server: {
		host: string;
		port: number;
	};
	database: {
		path: string;
	};
	week: {
		firstDay: number;
		generateDay: number;
	};
}

export function ensureDirectories(): void {
	mkdirSync(CONFIG_DIR, { recursive: true });
	mkdirSync(DATA_DIR, { recursive: true });
}

export function ensureConfig(): void {
	ensureDirectories();
	if (!existsSync(CONFIG_FILE)) {
		writeFileSync(CONFIG_FILE, DEFAULT_CONFIG, 'utf-8');
	}
}

function toToml(config: OntoplanoConfig): string {
	return `[server]
host = "${config.server.host}"
port = "${config.server.port}"

[database]
${config.database.path !== DB_PATH ? `path = "${config.database.path}"` : ''}

[week]
first_day = "${config.week.firstDay}"
generate_day = "${config.week.generateDay}"
`;
}

export function saveConfig(config: OntoplanoConfig): void {
	ensureDirectories();
	writeFileSync(CONFIG_FILE, toToml(config), 'utf-8');
}

export function loadConfig(): OntoplanoConfig {
	ensureConfig();

	const content = readFileSync(CONFIG_FILE, 'utf-8');
	const parsed = parseToml(content);

	const server = (parsed.server as Record<string, string>) || {};
	const database = (parsed.database as Record<string, string>) || {};
	const week = (parsed.week as Record<string, string>) || {};

	return {
		server: {
			host: server.host || '0.0.0.0',
			port: parseInt(server.port || '1493', 10)
		},
		database: {
			path: database.path || DB_PATH
		},
		week: {
			firstDay: parseInt(week.first_day || '0', 10),
			generateDay: parseInt(week.generate_day || '6', 10)
		}
	};
}
