import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const home = homedir();

/**
 * Where the instance's own settings live.
 *
 * Overridable so a second instance — or a test run — does not read the config
 * of whoever is logged into the machine. The tests used to do exactly that,
 * which meant a suite could pass or fail depending on a file outside the repo.
 */
export const CONFIG_DIR = process.env.ONTOPLANO_CONFIG_DIR || join(home, '.config', 'ontoplano');
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

[registration]
mode = "closed"

[account]
allow_email_change = "false"
`;

/**
 * Who may create an account here.
 *
 * `open` is a public sign-up page. `invite` asks for a code the owner handed
 * out. `closed` is the default, because the common deployment is one person on
 * one box and an open registration form there is an invitation to squat it.
 *
 * The first account is always allowed whatever this says — otherwise a fresh
 * install could never be used.
 */
export const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export function isRegistrationMode(value: unknown): value is RegistrationMode {
	return typeof value === 'string' && (REGISTRATION_MODES as readonly string[]).includes(value);
}

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
	registration: {
		mode: RegistrationMode;
	};
	account: {
		/**
		 * Whether a person may move their account to another address.
		 *
		 * Off unless the instance says otherwise: an email address is what an
		 * account *is* here — it signs in and it receives the reset link — so
		 * letting it be changed is the operator's call, not the account holder's.
		 */
		allowEmailChange: boolean;
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

[registration]
mode = "${config.registration.mode}"

[account]
allow_email_change = "${config.account.allowEmailChange}"
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
	const registration = (parsed.registration as Record<string, string>) || {};
	const account = (parsed.account as Record<string, string>) || {};

	return {
		server: {
			host: server.host || '0.0.0.0',
			port: parseInt(server.port || '1493', 10)
		},
		database: {
			// DATABASE_URL wins over the config file, because drizzle.config.ts and
			// scripts/migrate.mjs already resolve it that way — without this the app
			// could be reading one database while migrations rewrite another.
			path: process.env.DATABASE_URL || database.path || DB_PATH
		},
		week: {
			firstDay: parseInt(week.first_day || '0', 10),
			generateDay: parseInt(week.generate_day || '6', 10)
		},
		registration: {
			// An instance whose config predates this setting is closed, not open:
			// the safe reading of silence.
			mode: isRegistrationMode(registration.mode) ? registration.mode : 'closed'
		},
		account: {
			// Same reading: anything but an explicit "true" is no.
			allowEmailChange: account.allow_email_change === 'true'
		}
	};
}
