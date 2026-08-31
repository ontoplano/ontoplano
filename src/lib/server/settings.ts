import { DEFAULT_PRICING, type Pricing } from '../plans.js';
import { and, eq } from 'drizzle-orm';

import { db } from './db/index.js';
import { user, userSettings } from './db/schema.js';
import { STYLES, isStyle, type Style } from '../style.js';
import { THEMES, type Theme } from '../theme.js';
import { DEFAULT_CURRENCY, isCurrency, type Currency } from '../money.js';
import { isHideableSection, type HideableSection } from '../sections.js';

export function getUserSetting(userId: string, key: string): string | null {
	const row = db
		.select()
		.from(userSettings)
		.where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
		.get();

	return row?.value ?? null;
}

export function setUserSetting(userId: string, key: string, value: string): void {
	const existing = db
		.select()
		.from(userSettings)
		.where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
		.get();

	if (existing) {
		db.update(userSettings)
			.set({ value })
			.where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
			.run();
	} else {
		db.insert(userSettings).values({ userId, key, value }).run();
	}
}

// --- Theme -------------------------------------------------------------------

export { THEMES };
export type { Theme };

export const THEME_KEY = 'ui.theme';
export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: string | null | undefined): value is Theme {
	return !!value && (THEMES as readonly string[]).includes(value);
}

/**
 * The user's stored theme, or `system` if they have never chosen one.
 *
 * `system` is resolved in CSS from `prefers-color-scheme`, not here — the
 * server has no way to know what the device is set to, and guessing would make
 * the first paint wrong for half of visitors.
 */
export function getTheme(userId: string): Theme {
	const stored = getUserSetting(userId, THEME_KEY);
	return isTheme(stored) ? stored : DEFAULT_THEME;
}

export function setTheme(userId: string, theme: Theme): void {
	setUserSetting(userId, THEME_KEY, theme);
}

// --- Hidden sections ----------------------------------------------------------

export const HIDDEN_SECTIONS_KEY = 'ui.hiddenSections';

/**
 * The sections this account has put away — out of every menu, still there at
 * their URLs. Stored as a JSON array; unknown ids are dropped on read, so a
 * section that stops existing disappears from the setting by itself.
 */
export function getHiddenSections(userId: string): HideableSection[] {
	const stored = getUserSetting(userId, HIDDEN_SECTIONS_KEY);
	if (!stored) return [];
	try {
		const parsed: unknown = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(v): v is HideableSection => typeof v === 'string' && isHideableSection(v)
		);
	} catch {
		return [];
	}
}

export function setHiddenSections(userId: string, hidden: HideableSection[]): void {
	setUserSetting(userId, HIDDEN_SECTIONS_KEY, JSON.stringify([...new Set(hidden)]));
}

// --- Layout style ------------------------------------------------------------

export { STYLES };
export type { Style };

export const STYLE_KEY = 'ui.style';

/**
 * Playful, not sober.
 *
 * Sober was the default because it was the style the app was built in, which is
 * a reason about the past rather than about the person arriving. What a new
 * account should see is the version the landing page just promised — colour on
 * the chrome, rooms that look like rooms — and somebody who finds it too much
 * has the switch in Settings. The severe one is the taste you acquire, not the
 * one you are handed.
 */
export const DEFAULT_STYLE: Style = 'playful';

export function getStyle(userId: string): Style {
	const stored = getUserSetting(userId, STYLE_KEY);
	return isStyle(stored) ? stored : DEFAULT_STYLE;
}

export function setStyle(userId: string, style: Style): void {
	setUserSetting(userId, STYLE_KEY, style);
}

// --- Week ---------------------------------------------------------------------

/**
 * Which day a user's week starts on, and which day the next week is generated.
 *
 * These used to live in the instance's config file, which meant one setting for
 * everyone on the server — a product bug as much as a security one. They are
 * per-user now.
 */
export const WEEK_FIRST_DAY_KEY = 'week.firstDay';
export const WEEK_GENERATE_DAY_KEY = 'week.generateDay';

export type WeekSettings = { firstDay: number; generateDay: number };

export const DEFAULT_WEEK: WeekSettings = { firstDay: 0, generateDay: 6 };

function weekday(raw: string | null, fallback: number): number {
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback;
}

export function getWeekSettings(userId: string): WeekSettings {
	return {
		firstDay: weekday(getUserSetting(userId, WEEK_FIRST_DAY_KEY), DEFAULT_WEEK.firstDay),
		generateDay: weekday(getUserSetting(userId, WEEK_GENERATE_DAY_KEY), DEFAULT_WEEK.generateDay)
	};
}

export function setWeekSettings(userId: string, week: WeekSettings): void {
	setUserSetting(
		userId,
		WEEK_FIRST_DAY_KEY,
		String(weekday(String(week.firstDay), DEFAULT_WEEK.firstDay))
	);
	setUserSetting(
		userId,
		WEEK_GENERATE_DAY_KEY,
		String(weekday(String(week.generateDay), DEFAULT_WEEK.generateDay))
	);
}

// --- Planner hours ---------------------------------------------------------------

/**
 * The stretch of the day the planner grid draws.
 *
 * Six in the morning to midnight is a reasonable default and a poor law: a
 * baker's day starts at four and a night shift ends after it. Stored as whole
 * hours, because the gridlines are hourly and a start of 06:20 would only ever
 * be a way to make the labels ugly.
 */
export const GRID_START_KEY = 'planner.grid_start_hour';
export const GRID_END_KEY = 'planner.grid_end_hour';

export type GridHours = { start: number; end: number };
export const DEFAULT_GRID_HOURS: GridHours = { start: 6, end: 24 };

function hour(raw: string | null, fallback: number, max: number): number {
	const n = Number(raw);
	return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
}

export function getGridHours(userId: string): GridHours {
	const start = hour(getUserSetting(userId, GRID_START_KEY), DEFAULT_GRID_HOURS.start, 23);
	const end = hour(getUserSetting(userId, GRID_END_KEY), DEFAULT_GRID_HOURS.end, 24);

	// A stored pair that does not make a day is not worth honouring; the grid
	// would render nothing at all and look broken rather than misconfigured.
	return end > start ? { start, end } : DEFAULT_GRID_HOURS;
}

export function setGridHours(userId: string, hours: GridHours): void {
	setUserSetting(userId, GRID_START_KEY, String(hours.start));
	setUserSetting(userId, GRID_END_KEY, String(hours.end));
}

// --- Currency -------------------------------------------------------------------

/**
 * The one currency prices are in.
 *
 * One per account rather than per item: a shopping list in three currencies is
 * a spreadsheet, and nobody has asked for that.
 */
export const CURRENCY_KEY = 'shopping.currency';

export function getCurrency(userId: string): Currency {
	const stored = getUserSetting(userId, CURRENCY_KEY);
	return isCurrency(stored) ? stored : DEFAULT_CURRENCY;
}

export function setCurrency(userId: string, currency: Currency): void {
	setUserSetting(userId, CURRENCY_KEY, currency);
}

// --- Timezone -----------------------------------------------------------------

/**
 * The user's IANA timezone, captured at first run from the browser.
 *
 * Civil dates — what "today" means, which day a habit was logged on — are
 * computed in this zone rather than the server's. Stored instants are still
 * server-local (S7); R07 finishes that half.
 */
export const TIMEZONE_KEY = 'user.timezone';

export function getTimezone(userId: string): string | null {
	const stored = getUserSetting(userId, TIMEZONE_KEY);
	if (!stored) return null;
	try {
		// A bad value would throw on every date format for the rest of the session.
		new Intl.DateTimeFormat('en-CA', { timeZone: stored });
		return stored;
	} catch {
		return null;
	}
}

export function setTimezone(userId: string, tz: string): void {
	setUserSetting(userId, TIMEZONE_KEY, tz);
}

// --- First run ------------------------------------------------------------------

export const ONBOARDED_KEY = 'onboarding.done';

export function isOnboarded(userId: string): boolean {
	return getUserSetting(userId, ONBOARDED_KEY) === 'true';
}

export function markOnboarded(userId: string): void {
	setUserSetting(userId, ONBOARDED_KEY, 'true');
}

// --- Instance ownership --------------------------------------------------------

/**
 * Whether this request may change deployment settings — bind host, port,
 * database path.
 *
 * Those belong to whoever runs the server, not to whoever happens to be logged
 * in. On a self-hosted instance that is the single account; on a shared one it
 * is nobody, and the settings are read-only from the web entirely.
 *
 * ONTOPLANO_SELF_HOST is opt-in rather than opt-out, so a deployment that
 * forgets to set anything is the safe one.
 */
/**
 * Whether this deployment is somebody's own box.
 *
 * Opt-in, like `isInstanceOwner` below: a deployment that forgets to say is
 * treated as hosted, which is the answer with the fewer consequences.
 */
export function isSelfHosted(): boolean {
	return process.env.ONTOPLANO_SELF_HOST === 'true';
}

/**
 * Is this instance a staging one — not the real thing?
 *
 * Staging in the general sense: a copy people are invited to try, running with
 * the doors open in a way production is not. It is deliberately a single
 * environment variable rather than a config-file setting, because the switch
 * belongs to whoever runs the box and not to whoever is logged into it.
 *
 * It changes two things and says so everywhere. Registration opens, so people
 * can be let in without invite codes; and every page that could mislead
 * somebody about which instance they are on carries a band saying it. That
 * second half is the important one: the failure this exists to prevent is
 * leaving the flag set on the real instance and not noticing for a week.
 */
export function isStaging(): boolean {
	return process.env.ONTOPLANO_STAGING === 'true';
}

/**
 * The public demo.
 *
 * Every visitor gets an account of their own, seeded with a week worth looking
 * at and deleted once it has been left alone — see `services/demo.ts` for why
 * that beats one shared account wiped on a timer. Opt-in, like every other
 * deployment answer here: a box that forgets to say is an ordinary instance.
 *
 * `ONTOPLANO_DEMO_EMAIL` is no longer part of the switch. There is no one
 * account to name, and requiring it would have meant a box that upgraded to
 * this and dropped the variable silently stopped being a demo.
 */
export function isDemo(): boolean {
	return process.env.ONTOPLANO_DEMO === 'true';
}

/**
 * How long a demo account outlives its last page view.
 *
 * Since last seen rather than since created: somebody reading carefully for two
 * hours should not have the page taken away mid-sentence, and somebody who left
 * an hour ago is not coming back. Three hours by default — long enough to be a
 * proper look, short enough that a day's visitors are not still on the disk in
 * the morning.
 */
export function demoLifetimeMinutes(): number {
	const raw = Number(process.env.ONTOPLANO_DEMO_TTL_MINUTES);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 180;
}

/**
 * How many demo accounts may exist at once.
 *
 * The ceiling is the answer to "somebody points a script at it": each account
 * costs a seeded week on a small disk, and the honest failure when the demo is
 * full is the landing page rather than a broken app.
 */
export function demoMaxAccounts(): number {
	const raw = Number(process.env.ONTOPLANO_DEMO_MAX_ACCOUNTS);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
}

/**
 * What this instance charges, and how its trial runs.
 *
 * From the environment rather than compiled in, because a price is not a fact
 * about the software — the person running the instance decides it, and changing
 * it should not be a deploy. The defaults are argued for in the marketing
 * repository, alongside the study of what everyone else charges.
 */
export function pricing(): Pricing {
	const int = (name: string, fallback: number) => {
		const raw = Number(process.env[name]);
		return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : fallback;
	};

	return {
		monthlyCents: int('ONTOPLANO_PRICE_MONTHLY_CENTS', DEFAULT_PRICING.monthlyCents),
		yearlyCents: int('ONTOPLANO_PRICE_YEARLY_CENTS', DEFAULT_PRICING.yearlyCents),
		currency: process.env.ONTOPLANO_PRICE_CURRENCY || DEFAULT_PRICING.currency,
		// Bounded: a trial has to span two weekly reviews to show what the app is
		// for, and one longer than a season is not a trial.
		trialDays: Math.min(Math.max(int('ONTOPLANO_TRIAL_DAYS', DEFAULT_PRICING.trialDays), 0), 90),
		trialRequiresCard: process.env.ONTOPLANO_TRIAL_REQUIRES_CARD !== 'false',
		provider: process.env.ONTOPLANO_PAYMENT_PROVIDER || DEFAULT_PRICING.provider
	};
}

export function isInstanceOwner(userId: string): boolean {
	if (!isSelfHosted()) return false;

	const owner = process.env.ONTOPLANO_OWNER_ID;
	if (owner) return owner === userId;

	// Self-hosted with no owner named: the first account to exist is the owner,
	// which is the person who installed it.
	const first = db.select({ id: user.id }).from(user).orderBy(user.createdAt).limit(1).get();
	return first?.id === userId;
}

/**
 * The shared secret that lets a probe see disk and memory on `/healthz`.
 *
 * Unset means the endpoint stays as bare as it has always been. An empty
 * string is treated as unset rather than as a token that matches an empty
 * header, which is the failure this returns `null` to avoid.
 */
export function healthToken(): string | null {
	const value = process.env.ONTOPLANO_HEALTH_TOKEN;
	return value && value.length > 0 ? value : null;
}
