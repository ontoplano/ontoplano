import { and, eq } from 'drizzle-orm';

import { db } from './db/index.js';
import { userSettings } from './db/schema.js';
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
