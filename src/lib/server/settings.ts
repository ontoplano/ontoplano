import { and, eq } from 'drizzle-orm';

import { db } from './db/index.js';
import { userSettings } from './db/schema.js';

export const FEATURE_DEFAULTS: Record<string, boolean> = {
	'feature.threeWins': false,
	'feature.dashboardShopping': true,
	'feature.dashboardHabits': true
};

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
