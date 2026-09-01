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

[reports]
client_errors = "false"

[ui]
undo_seconds = "5"

[instance]
tagline = "Managing life, one week at a time"
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
	reports: {
		/**
		 * Whether the app may ask people to send in client-side errors.
		 *
		 * Off by default: a stack trace is somebody's data leaving their browser,
		 * so the instance opts in, and then each person is asked once and can say
		 * no. Nothing is ever sent before both have said yes.
		 */
		clientErrors: boolean;
	};
	ui: {
		/** Seconds a delete waits, undoably, before it happens. Zero turns it off. */
		undoSeconds: number;
	};
	instance: {
		/**
		 * The one line under the name on the signed-out front page.
		 *
		 * Here rather than in the component because it is the operator's
		 * sentence, not the app's: somebody running this for a household or a
		 * team should be able to say what their instance is without editing
		 * Svelte. Empty falls back to the line below.
		 */
		tagline: string;
	};
}

/** What the front page says when the instance has not said anything else. */
export const DEFAULT_TAGLINE = 'Managing life, one week at a time';

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

[reports]
client_errors = "${config.reports.clientErrors}"

[ui]
undo_seconds = "${config.ui.undoSeconds}"

[instance]
tagline = "${config.instance.tagline}"
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
	const reports = (parsed.reports as Record<string, string>) || {};
	const ui = (parsed.ui as Record<string, string>) || {};
	const instance = (parsed.instance as Record<string, string>) || {};

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
		},
		reports: {
			// And again: silence is no.
			clientErrors: reports.client_errors === 'true'
		},
		ui: {
			/*
			 * How long a delete waits before it happens.
			 *
			 * The confirmation still asks — that is the deliberate half. This is the
			 * accident half: the seconds between saying yes and meaning it, during
			 * which "Undo" costs nothing because the row has not gone anywhere.
			 *
			 * Zero turns it off and deletes immediately. Bounded at a minute, since
			 * a delete that has not happened yet is a delete somebody can lose by
			 * closing the tab.
			 */
			undoSeconds: Math.min(Math.max(parseInt(ui.undo_seconds || '5', 10) || 0, 0), 60)
		},
		instance: {
			tagline: (instance.tagline || '').trim() || DEFAULT_TAGLINE
		}
	};
}
