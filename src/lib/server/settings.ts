import { and, eq } from 'drizzle-orm';

import { db } from './db/index.js';
import { user, userSettings } from './db/schema.js';
import { THEMES, type Theme } from '../theme.js';

/**
 * Feature flags.
 *
 * The three dashboard toggles that used to live here are gone: which cards
 * appear is a layout now (see $lib/dashboard.ts), which also covers ordering
 * and the cards those flags never knew about.
 */
export const FEATURE_DEFAULTS: Record<string, boolean> = {};

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

export function getFeatureFlags(userId: string): Record<string, boolean> {
	const flags: Record<string, boolean> = {};

	for (const [key, defaultVal] of Object.entries(FEATURE_DEFAULTS)) {
		const val = getUserSetting(userId, key);
		flags[key] = val !== null ? val === 'true' : defaultVal;
	}

	return flags;
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
export function isInstanceOwner(userId: string): boolean {
	if (process.env.ONTOPLANO_SELF_HOST !== 'true') return false;

	const owner = process.env.ONTOPLANO_OWNER_ID;
	if (owner) return owner === userId;

	// Self-hosted with no owner named: the first account to exist is the owner,
	// which is the person who installed it.
	const first = db.select({ id: user.id }).from(user).orderBy(user.createdAt).limit(1).get();
	return first?.id === userId;
}
