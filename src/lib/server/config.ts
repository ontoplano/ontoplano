import { DEFAULT_PICTURE_KILOBYTES, DEFAULT_UNDO_SECONDS } from '$lib/instance-defaults.js';
import { DEFAULT_PRICING } from '$lib/plans.js';
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
export function configDir(): string {
	return process.env.ONTOPLANO_CONFIG_DIR || join(home, '.config', 'ontoplano');
}

/**
 * Where the database and anything else this instance writes lives.
 *
 * Overridable for the same reason the config directory is, and for one more:
 * a distribution package puts the app's data in `/var/lib/ontoplano` and its
 * settings in `/etc/ontoplano`, because that is where an operator, a backup
 * tool and a distribution's own conventions all expect to find them. Without
 * this, the service account's home would have to be bent into
 * `/var/lib/ontoplano/.local/share/ontoplano/` to satisfy a path written here.
 */
export function dataDir(): string {
	return process.env.ONTOPLANO_DATA_DIR || join(home, '.local', 'share', 'ontoplano');
}

// Functions, not constants: a test sets the environment first and imports
// whatever it likes after, and nothing here is allowed to remember the world
// from before. Reading the environment at call time is what makes import
// order not matter.
export function configFile(): string {
	return join(configDir(), 'config.toml');
}
export function dbPath(): string {
	return join(dataDir(), 'ontoplano.db');
}

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

		/*
		 * A quoted value may contain an escaped quote, because `q()` puts one
		 * there: a tagline reading `a "quoted" one` is written `a \"quoted\" one`
		 * and has to come back as it went in. Bare values — what a hand-edited
		 * file usually holds — are taken as they are.
		 */
		const quoted = line.match(/^(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
		const bare = quoted ? null : line.match(/^(\w+)\s*=\s*(.*)$/);
		const match = quoted ?? bare;
		if (match) {
			const key = match[1];
			const value = quoted ? match[2].replace(/\\(["\\])/g, '$1') : match[2].trim();
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

# Whether an account has to confirm its address before it can use anything.
# Off by default: on a box for one household the mail may not even be set up,
# and an account that cannot confirm is an account that cannot get in.
require_verified_email = "false"

[account]
allow_email_change = "false"

[reports]
client_errors = "false"
# Where reports and suggestions are mailed, on top of being recorded here.
# Empty keeps them in this instance only.
feedback_email = ""

[ui]
undo_seconds = "5"

[newsletter]
enabled = "false"
origin = ""

[instance]
tagline = "Managing life, one week at a time"

# The workbenches under /dev — not screens of the app, and off unless the
# person running this wants them. There are none at the moment.
dev_tools = "false"

# Your own copy, rather than one somebody sells. Off means hosted, which is
# the answer with fewer consequences for an instance that forgot to say.
self_host = "false"

docs_url = "https://docs.ontoplano.com"
site_url = "https://ontoplano.com"

# Whoever runs this instance, for the privacy and terms pages — they are your
# statement, not the app's. Empty is honest: the pages say "the person who
# runs this instance" and "ask whoever runs this instance".
[legal]
operator = ""
contact_email = ""
jurisdiction = ""
policy_updated = "25 August 2026"

# What this instance charges, if it charges. Almost none do: leave sells off
# and the money pages never appear.
[pricing]
sells = "false"
monthly_cents = "${DEFAULT_PRICING.monthlyCents}"
yearly_cents = "${DEFAULT_PRICING.yearlyCents}"
family_monthly_cents = "${DEFAULT_PRICING.familyMonthlyCents}"
family_yearly_cents = "${DEFAULT_PRICING.familyYearlyCents}"
family_seats = "${DEFAULT_PRICING.familySeats}"
currency = "${DEFAULT_PRICING.currency}"
trial_days = "${DEFAULT_PRICING.trialDays}"
trial_requires_card = "true"
provider = "${DEFAULT_PRICING.provider}"

[review]
# Hours after the week turns before the review mail goes out.
mail_offset_hours = "1"

[media]
max_kilobytes = "500"
recipe_images = "6"
entry_images = "20"

# The gallery's ceilings: how many albums an account may keep, and how many
# pictures one album may hold. Generous here because this instance is yours;
# a hosted instance names tighter ones.
gallery_albums = "100"
album_images = "500"
account_megabytes = "250"

# The most files one folder import may carry. The browser sends the tree in
# batches that fit in one request; this is the whole tree's ceiling.
import_files = "2000"
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
		/**
		 * Whether an account must confirm its address before it can use
		 * anything. Off by default: on a box for one household the mail may not
		 * be set up at all, and an account that cannot confirm cannot get in.
		 */
		requireVerifiedEmail: boolean;
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
		/**
		 * Where a report or a suggestion is mailed, beside being recorded.
		 *
		 * Empty means nowhere: the instance keeps them in its own table and the
		 * operator reads them in /admin, which is the right default for
		 * somebody running this for a household. An instance with somebody
		 * actually listening names an address here.
		 */
		feedbackEmail: string;
	};
	ui: {
		/** Seconds a delete waits, undoably, before it happens. Zero turns it off. */
		undoSeconds: number;
	};
	/**
	 * Who runs this instance, for the pages that have to say so.
	 *
	 * The privacy and terms pages are the operator's statement, not the app's,
	 * and a self-hosted copy saying somebody else's name would be a lie. Empty
	 * gives the honest fallback — "the person who runs this instance".
	 */
	legal: {
		operator: string;
		contactEmail: string;
		jurisdiction: string;
		/** The date the pages say they were last changed. */
		policyUpdated: string;
	};
	/**
	 * What this instance charges, if it charges.
	 *
	 * Almost every instance does not: `sells` is off, the money pages never
	 * appear, and none of the rest of this matters. The numbers are here rather
	 * than in the code because the instance that does sell has to be able to
	 * change them without a deploy — and they have to match what the payment
	 * provider was told, which is a thing to check against a file rather than
	 * against a constant compiled into a bundle.
	 */
	pricing: {
		sells: boolean;
		monthlyCents: number;
		yearlyCents: number;
		familyMonthlyCents: number;
		familyYearlyCents: number;
		/** How many accounts one family invoice covers. */
		familySeats: number;
		currency: string;
		trialDays: number;
		trialRequiresCard: boolean;
		provider: string;
	};
	/** How the weekly review mail behaves. */
	review: {
		/** Hours after the week turns before the mail goes out. */
		mailOffsetHours: number;
	};
	media: {
		/**
		 * The biggest single picture this instance accepts, in kilobytes.
		 *
		 * Enforced on the server against the bytes actually received, not against
		 * what the browser said it was sending. Pictures are rows in the same
		 * SQLite file as everything else, so this is also the number that decides
		 * how fast that file grows.
		 */
		maxKilobytes: number;
		/** How many pictures one recipe may carry. One of them is the main one. */
		recipeImages: number;
		/** How many pictures one notebook entry may carry. */
		entryImages: number;
		/** Everything one account's pictures may add up to, in megabytes. */
		accountMegabytes: number;
		/** How many albums one account may keep. */
		galleryAlbums: number;
		/** How many pictures one album may hold. */
		albumImages: number;
		/**
		 * How many files one folder import may carry.
		 *
		 * A tree chosen in the picker is a number the person did not type, and
		 * a hundred thousand of them would be read into this process's memory
		 * one request at a time. The ceiling is named so the preview can say
		 * what it left out rather than silently stopping at some number.
		 */
		importFiles: number;
	};
	newsletter: {
		/**
		 * Whether this instance keeps a list of people to tell when it changes.
		 *
		 * Off unless the instance says otherwise, like every other feature that
		 * collects an address from somebody who is not an account holder: a
		 * self-hosted install has nothing to announce, and a subscribe form on
		 * it is a box that fills up with whatever crawlers put in it.
		 *
		 * On, it opens one public endpoint — `/api/subscribe` — which takes an
		 * address, sends one confirmation, and does nothing at all until that
		 * link is followed.
		 */
		enabled: boolean;
		/**
		 * The site allowed to post the form, if the form is not on this host.
		 *
		 * ontoplano.com is a different origin from app.ontoplano.com, so the
		 * footer form is a cross-origin POST and the browser will not send it
		 * without being told. Empty means same-origin only, which is what a
		 * self-hosted instance wants even with the list turned on.
		 */
		origin: string;
	};
	instance: {
		/**
		 * Whether this instance carries the workbenches under `/dev`.
		 *
		 * Off everywhere unless somebody turns it on. They are not screens of
		 * the app, and an instance somebody else runs has no reason to carry
		 * them or to know they exist. There are none at the moment.
		 *
		 * Here rather than in an environment variable because this is a thing
		 * the instance allows, and everything an instance allows is in this
		 * one file.
		 */
		devTools: boolean;
		/**
		 * Whether this is somebody's own copy rather than one that is sold.
		 *
		 * Off by default, which treats an instance as hosted — the answer with
		 * the fewer consequences for an instance that forgot to say.
		 */
		selfHost: boolean;
		/** Where this instance's documentation and project pages are. */
		docsUrl: string;
		siteUrl: string;
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
	mkdirSync(configDir(), { recursive: true });
	mkdirSync(dataDir(), { recursive: true });
}

export function ensureConfig(): void {
	ensureDirectories();
	if (!existsSync(configFile())) {
		writeFileSync(configFile(), DEFAULT_CONFIG, 'utf-8');
	}
}

/**
 * A value, as a TOML string it cannot escape from.
 *
 * Several of these come from a form — the tagline, the address reports go to
 * — and every one of them used to be interpolated straight between two
 * quotes. A value holding a quote or a newline ended the string early and
 * left the file unparseable, which on the next boot is an instance that
 * cannot read its own settings. Escaped here rather than validated at each
 * call site, because the writer is the one place every setting passes
 * through.
 */
function q(value: unknown): string {
	const text = String(value ?? '')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"');
	return `"${text}"`;
}

function toToml(config: OntoplanoConfig): string {
	return `[server]
host = ${q(config.server.host)}
port = ${q(config.server.port)}

[database]
${config.database.path !== dbPath() ? `path = ${q(config.database.path)}` : ''}

[week]
first_day = ${q(config.week.firstDay)}
generate_day = ${q(config.week.generateDay)}

[registration]
mode = ${q(config.registration.mode)}
require_verified_email = ${q(config.registration.requireVerifiedEmail)}

[account]
allow_email_change = ${q(config.account.allowEmailChange)}

[reports]
client_errors = ${q(config.reports.clientErrors)}
feedback_email = ${q(config.reports.feedbackEmail)}

[ui]
undo_seconds = ${q(config.ui.undoSeconds)}

[newsletter]
enabled = ${q(config.newsletter.enabled)}
origin = ${q(config.newsletter.origin)}

[instance]
tagline = ${q(config.instance.tagline)}
dev_tools = ${q(config.instance.devTools)}
self_host = ${q(config.instance.selfHost)}
docs_url = ${q(config.instance.docsUrl)}
site_url = ${q(config.instance.siteUrl)}

[legal]
operator = ${q(config.legal.operator)}
contact_email = ${q(config.legal.contactEmail)}
jurisdiction = ${q(config.legal.jurisdiction)}
policy_updated = ${q(config.legal.policyUpdated)}

[pricing]
sells = ${q(config.pricing.sells)}
monthly_cents = ${q(config.pricing.monthlyCents)}
yearly_cents = ${q(config.pricing.yearlyCents)}
family_monthly_cents = ${q(config.pricing.familyMonthlyCents)}
family_yearly_cents = ${q(config.pricing.familyYearlyCents)}
family_seats = ${q(config.pricing.familySeats)}
currency = ${q(config.pricing.currency)}
trial_days = ${q(config.pricing.trialDays)}
trial_requires_card = ${q(config.pricing.trialRequiresCard)}
provider = ${q(config.pricing.provider)}

[review]
mail_offset_hours = ${q(config.review.mailOffsetHours)}

[media]
max_kilobytes = ${q(config.media.maxKilobytes)}
recipe_images = ${q(config.media.recipeImages)}
entry_images = ${q(config.media.entryImages)}
gallery_albums = ${q(config.media.galleryAlbums)}
album_images = ${q(config.media.albumImages)}
account_megabytes = ${q(config.media.accountMegabytes)}
import_files = ${q(config.media.importFiles)}
`;
}

export function saveConfig(config: OntoplanoConfig): void {
	ensureDirectories();
	writeFileSync(configFile(), toToml(config), 'utf-8');
}

/**
 * The file, brought up to the shape this build knows.
 *
 * A `config.toml` written a year ago does not mention the settings added
 * since — the reader falls back to a default and the file says nothing about
 * them, so somebody looking for "how many albums may an account keep" finds
 * no line to change and no evidence the question has an answer. Every load
 * therefore checks whether the file still names everything, and writes it
 * back with the missing lines when it does not. Nothing already set is
 * touched: what is written is exactly what was just read.
 *
 * This is also how a setting that used to be an environment variable arrives:
 * the reader takes the old variable's value when the file has no line yet, so
 * the first boot after an upgrade writes it into the file and every boot after
 * that reads it from there.
 */
/**
 * A variable still set in the environment that the file also answers.
 *
 * Said once per variable per process, not once per read. Two places holding
 * the same answer is exactly what moving these into the file is meant to end,
 * so the one that is losing says so by name.
 */
const alreadySaid = new Set<string>();
function shadowed(variable: string): void {
	if (alreadySaid.has(variable)) return;
	alreadySaid.add(variable);
	console.warn(
		`ontoplano: ${variable} is set in the environment and overrides the same setting in ` +
			'config.toml. Delete it from the env file and config.toml decides.'
	);
}

function grow(config: OntoplanoConfig, content: string): void {
	const missing = toToml(config)
		.split('\n')
		.filter((line) => /^\w+ = /.test(line))
		.map((line) => line.slice(0, line.indexOf(' =')))
		.filter((key) => !new RegExp(`^${key}\\s*=`, 'm').test(content));
	if (missing.length === 0) return;

	try {
		writeFileSync(configFile(), toToml(config), 'utf-8');
		// stderr, not stdout: scripts read this process's output, and a
		// diagnostic that lands in the middle of it is a broken script.
		console.warn(
			`ontoplano: config.toml did not mention ${missing.join(', ')} — ` +
				'written in with the value in force, so the file says what the instance does.'
		);
	} catch (e) {
		// A read-only config directory is somebody's deliberate choice; the
		// instance runs on the defaults and says so rather than refusing.
		console.warn('ontoplano: config.toml could not be brought up to date:', e);
	}
}

export function loadConfig(): OntoplanoConfig {
	ensureConfig();

	const content = readFileSync(configFile(), 'utf-8');
	const parsed = parseToml(content);

	const server = (parsed.server as Record<string, string>) || {};
	const database = (parsed.database as Record<string, string>) || {};
	const week = (parsed.week as Record<string, string>) || {};
	const registration = (parsed.registration as Record<string, string>) || {};
	const account = (parsed.account as Record<string, string>) || {};
	const reports = (parsed.reports as Record<string, string>) || {};
	const ui = (parsed.ui as Record<string, string>) || {};
	const newsletter = (parsed.newsletter as Record<string, string>) || {};
	const instance = (parsed.instance as Record<string, string>) || {};
	const media = (parsed.media as Record<string, string>) || {};
	const legal = (parsed.legal as Record<string, string>) || {};
	const pricing = (parsed.pricing as Record<string, string>) || {};
	const review = (parsed.review as Record<string, string>) || {};

	/*
	 * A value the file does not carry yet, taken from where it used to live.
	 *
	 * These settings were environment variables before they were lines in this
	 * file. A box whose env file still sets one keeps behaving exactly as it
	 * did: the value is read from the environment this once, `grow()` writes
	 * it into the file, and from the next boot the file is the answer. Nothing
	 * has to be migrated by hand and nothing changes behaviour on upgrade.
	 */
	const was = (fromFile: string | undefined, variable: string) => {
		const fromEnv = process.env[variable];
		if (fromEnv === undefined) return fromFile;
		if (fromFile !== undefined) shadowed(variable);
		return fromEnv;
	};

	/** A number from the file, or the default, never NaN and never absurd. */
	const bounded = (raw: string | undefined, fallback: number, min: number, max: number) =>
		Math.min(Math.max(parseInt(raw || '', 10) || fallback, min), max);

	/** A price in minor units: zero is a real answer, so `bounded` will not do. */
	const money = (raw: string | undefined, fallback: number) => {
		const n = parseInt(raw ?? '', 10);
		return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000) : fallback;
	};

	const config: OntoplanoConfig = {
		server: {
			host: server.host || '0.0.0.0',
			port: parseInt(server.port || '1493', 10)
		},
		database: {
			// DATABASE_URL wins over the config file, because drizzle.config.ts and
			// scripts/migrate.mjs already resolve it that way — without this the app
			// could be reading one database while migrations rewrite another.
			path: process.env.DATABASE_URL || database.path || dbPath()
		},
		week: {
			firstDay: parseInt(week.first_day || '0', 10),
			generateDay: parseInt(week.generate_day || '6', 10)
		},
		registration: {
			// An instance whose config predates this setting is closed, not open:
			// the safe reading of silence.
			mode: isRegistrationMode(registration.mode) ? registration.mode : 'closed',
			requireVerifiedEmail:
				was(registration.require_verified_email, 'ONTOPLANO_REQUIRE_VERIFIED_EMAIL') === 'true'
		},
		account: {
			// Same reading: anything but an explicit "true" is no.
			allowEmailChange: account.allow_email_change === 'true'
		},
		reports: {
			// And again: silence is no.
			clientErrors: reports.client_errors === 'true',
			feedbackEmail: (reports.feedback_email || '').trim()
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
			undoSeconds: Math.min(
				Math.max(parseInt(ui.undo_seconds || String(DEFAULT_UNDO_SECONDS), 10) || 0, 0),
				60
			)
		},
		newsletter: {
			// Silence is no, as everywhere else in this file.
			enabled: newsletter.enabled === 'true',
			// A single origin, and only if it is one: anything that is not an
			// https:// origin with no path is dropped rather than echoed back in
			// an Access-Control-Allow-Origin header.
			origin: (() => {
				const raw = (newsletter.origin || '').trim().replace(/\/+$/, '');
				if (!raw) return '';
				try {
					const url = new URL(raw);
					if (url.protocol !== 'https:' && url.hostname !== 'localhost') return '';
					return url.pathname === '/' ? url.origin : '';
				} catch {
					return '';
				}
			})()
		},
		instance: {
			tagline: (instance.tagline || '').trim() || DEFAULT_TAGLINE,
			devTools: instance.dev_tools === 'true',
			selfHost: was(instance.self_host, 'ONTOPLANO_SELF_HOST') === 'true',
			docsUrl: (
				was(instance.docs_url, 'ONTOPLANO_DOCS_URL') || 'https://docs.ontoplano.com'
			).replace(/\/+$/, ''),
			siteUrl: (was(instance.site_url, 'ONTOPLANO_SITE_URL') || 'https://ontoplano.com').replace(
				/\/+$/,
				''
			)
		},
		legal: {
			operator: was(legal.operator, 'ONTOPLANO_OPERATOR') || '',
			contactEmail: was(legal.contact_email, 'ONTOPLANO_CONTACT_EMAIL') || '',
			jurisdiction: was(legal.jurisdiction, 'ONTOPLANO_JURISDICTION') || '',
			policyUpdated: was(legal.policy_updated, 'ONTOPLANO_POLICY_UPDATED') || '25 August 2026'
		},
		pricing: {
			sells: was(pricing.sells, 'ONTOPLANO_SELLS') === 'true',
			monthlyCents: money(
				was(pricing.monthly_cents, 'ONTOPLANO_PRICE_MONTHLY_CENTS'),
				DEFAULT_PRICING.monthlyCents
			),
			yearlyCents: money(
				was(pricing.yearly_cents, 'ONTOPLANO_PRICE_YEARLY_CENTS'),
				DEFAULT_PRICING.yearlyCents
			),
			familyMonthlyCents: money(
				was(pricing.family_monthly_cents, 'ONTOPLANO_PRICE_FAMILY_MONTHLY_CENTS'),
				DEFAULT_PRICING.familyMonthlyCents
			),
			familyYearlyCents: money(
				was(pricing.family_yearly_cents, 'ONTOPLANO_PRICE_FAMILY_YEARLY_CENTS'),
				DEFAULT_PRICING.familyYearlyCents
			),
			// Two is a family; twenty is a company buying the wrong product.
			familySeats: bounded(
				was(pricing.family_seats, 'ONTOPLANO_FAMILY_SEATS'),
				DEFAULT_PRICING.familySeats,
				2,
				20
			),
			currency: was(pricing.currency, 'ONTOPLANO_PRICE_CURRENCY') || DEFAULT_PRICING.currency,
			// A trial has to span two weekly reviews to show what the app is for,
			// and one longer than a season is not a trial.
			trialDays: bounded(
				was(pricing.trial_days, 'ONTOPLANO_TRIAL_DAYS'),
				DEFAULT_PRICING.trialDays,
				0,
				90
			),
			trialRequiresCard:
				was(pricing.trial_requires_card, 'ONTOPLANO_TRIAL_REQUIRES_CARD') !== 'false',
			provider: was(pricing.provider, 'ONTOPLANO_PAYMENT_PROVIDER') || DEFAULT_PRICING.provider
		},
		review: {
			mailOffsetHours: bounded(
				was(review.mail_offset_hours, 'ONTOPLANO_REVIEW_MAIL_OFFSET_HOURS'),
				1,
				0,
				23
			)
		},
		media: {
			/*
			 * The ceilings on pictures.
			 *
			 * Bounded rather than trusted: these are the numbers standing between
			 * an open registration and a full disk, and a typo that made one of
			 * them a hundred times bigger would not look like a typo. The upper
			 * bounds here are the most this code will honour, not a recommendation
			 * — the defaults are what a sane instance runs.
			 */
			maxKilobytes: bounded(media.max_kilobytes, DEFAULT_PICTURE_KILOBYTES, 16, 20_000),
			recipeImages: bounded(media.recipe_images, 6, 1, 50),
			entryImages: bounded(media.entry_images, 20, 1, 200),
			// Generous by default — the defaults are a stranger's own instance,
			// and their disk is theirs. A hosted instance names its own ceilings
			// in its config.
			galleryAlbums: bounded(media.gallery_albums, 100, 1, 10_000),
			albumImages: bounded(media.album_images, 500, 1, 100_000),
			accountMegabytes: bounded(media.account_megabytes, 250, 1, 100_000),
			importFiles: bounded(media.import_files, 2000, 1, 100_000)
		}
	};

	grow(config, content);
	return config;
}
