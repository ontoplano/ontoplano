/**
 * A person's own settings, kept in their rows.
 *
 * Everything here is one account reading and writing `user_settings`, which
 * is why it can run on any instance — the server, or the device itself. What
 * the *deployment* is (self-hosted, staging, local) stays in
 * `$lib/server/settings.ts`, because a browser has no environment to ask.
 */
import { and, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { userSettings } from '$lib/db/schema.js';
import { STYLES, isStyle, type Style } from '../style.js';
import { THEMES, type Theme } from '../theme.js';
import { DEFAULT_CURRENCY, isCurrency, type Currency } from '../money.js';
import { isHideableSection, type HideableSection } from '../sections.js';
import { isClock, type Clock } from '../when.js';
import { isLocale, type Locale } from '../i18n/locales.js';
import { SECTIONS } from '../colors.js';
import { isHexColor } from '../nav-order.js';

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

// --- Language -----------------------------------------------------------------

export const LOCALE_KEY = 'ui.locale';

/**
 * The language this account reads the app in.
 *
 * Null rather than a default when nothing has been chosen, because "no answer"
 * and "English" are different states and only the caller knows which fallback
 * belongs where: a page falls back to what the browser asked for, an email
 * falls back to the instance's own language, and neither can be decided here.
 *
 * An unknown tag reads as no answer. A language that is removed from the app
 * therefore lets everyone who chose it fall back cleanly instead of rendering
 * a screen of keys.
 */
export function getLocale(userId: string): Locale | null {
	const stored = getUserSetting(userId, LOCALE_KEY);
	return isLocale(stored) ? stored : null;
}

export function setLocale(userId: string, locale: Locale): void {
	setUserSetting(userId, LOCALE_KEY, locale);
}

// --- The clock ----------------------------------------------------------------

export const CLOCK_KEY = 'ui.clock';

/**
 * Whether this account reads a 12- or a 24-hour clock.
 *
 * `auto` — the default, and what almost everybody should be on — asks the
 * language: English says four in the afternoon, Portuguese and German say
 * sixteen. It is a setting because the language is a good guess about a person
 * and not a statement about them: plenty of people read English and think in
 * 24, and the app has no business arguing.
 */
export function getClock(userId: string): Clock {
	const stored = getUserSetting(userId, CLOCK_KEY);
	return isClock(stored) ? stored : 'auto';
}

export function setClock(userId: string, clock: Clock): void {
	setUserSetting(userId, CLOCK_KEY, clock);
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

// --- The tour ----------------------------------------------------------------

export const TUTORIAL_KEY = 'ui.tutorialSeen';

/**
 * Whether this account has been shown around.
 *
 * The tour runs unasked exactly once — on the first screen after first run —
 * and lives on a button in the corner from then on. One flag rather than one
 * per screen: being walked through the app is a thing that happens to a person,
 * not to a page, and an account that meets the same welcome on every new room
 * has been nagged rather than helped.
 *
 * The demo does not consult this. Every visitor there is somebody's first visit
 * and the account is shared with nobody, so the demo remembers a dismissal for
 * the length of the tab and forgets it afterwards.
 */
export function hasSeenTutorial(userId: string): boolean {
	return getUserSetting(userId, TUTORIAL_KEY) === 'true';
}

export function setTutorialSeen(userId: string, seen: boolean): void {
	setUserSetting(userId, TUTORIAL_KEY, seen ? 'true' : 'false');
}

// --- The menu: its order, and its colours ------------------------------------

export const NAV_ORDER_KEY = 'ui.navOrder';
export const SECTION_COLORS_KEY = 'ui.sectionColors';

/**
 * The order this account wants its rooms in, as a list of keys.
 *
 * Stored thin and validated on the way out rather than on the way in: what is
 * a room changes as the app grows, so a list that was valid when it was saved
 * can name something that no longer exists. `applyOrder` in `$lib/nav-order.ts`
 * is where a missing key is dropped and a new room is kept, and it is the only
 * place that decides either.
 */
export function getNavOrder(userId: string): string[] {
	const stored = getUserSetting(userId, NAV_ORDER_KEY);
	if (!stored) return [];
	try {
		const parsed: unknown = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(v): v is string => typeof v === 'string' && v.length > 0 && v.length < 64
		);
	} catch {
		return [];
	}
}

export function setNavOrder(userId: string, order: string[]): void {
	setUserSetting(userId, NAV_ORDER_KEY, JSON.stringify([...new Set(order)]));
}

/**
 * The colours this account has changed, keyed by section. The rest are the
 * app's own; `$lib/colors.ts` still holds those and is still the default.
 *
 * Only `#rrggbb` is stored and only `#rrggbb` is returned. A colour reaches a
 * `style` attribute, which is one of the very few settings that does, so it is
 * checked at both ends rather than trusted at either.
 */
export function getSectionColors(userId: string): Record<string, string> {
	const stored = getUserSetting(userId, SECTION_COLORS_KEY);
	if (!stored) return {};
	try {
		const parsed: unknown = JSON.parse(stored);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>).filter(([, v]) => isHexColor(v))
		) as Record<string, string>;
	} catch {
		return {};
	}
}

export function setSectionColors(userId: string, colors: Record<string, string>): void {
	const clean = Object.fromEntries(
		Object.entries(colors).filter(([key, value]) => key in SECTIONS && isHexColor(value))
	);
	setUserSetting(userId, SECTION_COLORS_KEY, JSON.stringify(clean));
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
 * account should see is the version the front page just promised — colour on
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
	// Unset first, and explicitly: `Number(null)` is 0, not NaN, so an hour that
	// had never been stored read as midnight and passed every check below. An
	// account with a start hour and no end hour therefore had an end of zero,
	// which is not a day, and the whole pair was thrown away for the default.
	if (raw === null || raw.trim() === '') return fallback;

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

// --- The width of a two-column screen's left panel ------------------------------

/**
 * How wide the left-hand panel of a split screen is, in rem.
 *
 * Somebody's own names are as long as they made them — "asf 1213 21321 a…" is
 * what a fixed column does to one of them — and no default fits everybody, so
 * the panel takes its width from a handle and remembers where it was left. The
 * space comes off whatever is beside it, which is the only place it can come
 * from; the bounds keep the panel from swallowing the room or vanishing.
 *
 * One set of bounds and one pair of functions for every screen that splits
 * this way, keyed by the screen: two screens with the same handle should not
 * disagree about how narrow it may go, and a third added later should not have
 * to decide.
 */
export const PANEL_WIDTH = { min: 13, max: 34, fallback: 17 } as const;

export const LOCATION_PANEL_WIDTH_KEY = 'inventory.location_panel_rem';
export const NOTEBOOK_PANEL_WIDTH_KEY = 'notebooks.list_panel_rem';

export function getPanelWidth(userId: string, key: string): number {
	const raw = getUserSetting(userId, key);
	if (raw === null || raw.trim() === '') return PANEL_WIDTH.fallback;
	const rem = Number(raw);
	return Number.isFinite(rem) && rem >= PANEL_WIDTH.min && rem <= PANEL_WIDTH.max
		? rem
		: PANEL_WIDTH.fallback;
}

export function setPanelWidth(userId: string, key: string, rem: number): void {
	const held = Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, rem));
	setUserSetting(userId, key, String(Math.round(held * 10) / 10));
}
