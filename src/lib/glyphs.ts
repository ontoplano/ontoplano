import type { IconName } from '$lib/components/Icon.svelte';

/**
 * Every glyph the navigation draws, in one place.
 *
 * A room in the bar, a tab inside it, a tab on a notebook and a wedge of the
 * wheel are four renderings of the same handful of ideas, and each of them
 * used to carry its own `icon:` beside its own label. So changing what Ideas
 * looks like meant finding it in three files and hoping there was not a
 * fourth — and the tabs that had simply never been given one were invisible
 * as a gap rather than as a mistake.
 *
 * This is the one list. Everything that draws a glyph asks here, by the name
 * it already knows the thing as, and a change here shows up everywhere at
 * once.
 *
 * ## Keyed by what the caller already has
 *
 * A room knows its `NavKey`, a tab knows its `href`, a notebook's module
 * knows its id. Those are three kinds of string and they share one map on
 * purpose: `goals` the room and `goals` the notebook tab are the same idea
 * seen from two places and must not drift into two pictures. Where a thing
 * has both — a tab whose href is here and whose id is too — the href wins,
 * because it is the more specific of the two.
 *
 * Adding a room, a tab or a module without adding its glyph is caught by
 * `tests/glyphs.test.ts` rather than noticed later on a screen.
 */
export const GLYPHS: Record<string, IconName> = {
	/* ── The rooms of the bar ─────────────────────────────────────────── */
	planner: 'planner',
	diary: 'diary',
	health: 'health',
	inventory: 'shopping',
	finance: 'wallet',
	goals: 'goals',
	media: 'image',
	reminders: 'clock',

	/* ── The writing room's tabs ──────────────────────────────────────── */
	'/notebooks': 'notebook',
	'/notebooks/diary': 'diary',
	'/notebooks/ideas': 'ideas',
	// What the weekly review writes: a week, which is what it is filed by.
	'/notebooks/weekly': 'calendar',
	'/notebooks/people': 'user',
	'/notebooks/tags': 'tag',

	/* ── The planner's ───────────────────────────────────────────────── */
	'/tasks/plan': 'calendar',
	'/tasks/board': 'planner',
	'/tasks/todo': 'check',
	'/tasks/activities': 'tag',
	'/tasks/review': 'check',

	/* ── Health's ────────────────────────────────────────────────────── */
	'/health/habits': 'health',
	'/health/workouts': 'flame',
	'/health/recipes': 'utensils',

	/* ── Money's ─────────────────────────────────────────────────────── */
	'/finance/ledgers': 'wallet',
	// A bill is money leaving on a date, which is the thing about it.
	'/finance/bills': 'calendar',
	'/finance/rules': 'filter',
	'/finance/insights': 'info',

	/* ── What is in the house, and what is not yet ───────────────────── */
	'/inventory/stock': 'shopping',
	'/inventory/wishlist': 'star',

	/* ── Media ───────────────────────────────────────────────────────── */
	'/media/audios': 'mic',
	'/media/gallery': 'image',

	/* ── A notebook's own tabs ───────────────────────────────────────── */
	notes: 'note',
	tasks: 'planner',
	ideas: 'ideas',
	ledgers: 'wallet',
	bills: 'wallet',
	habits: 'health',
	workouts: 'flame',
	recipes: 'utensils'
};

/**
 * The glyph for a thing, by whatever it is called.
 *
 * Several keys may be given — a tab's href and then its id — and the first
 * one the list knows wins. `undefined` where nothing does, so a caller can
 * fall back to the room's own rather than draw a hole.
 */
export function glyphFor(...keys: (string | undefined)[]): IconName | undefined {
	for (const key of keys) if (key && key in GLYPHS) return GLYPHS[key];
	return undefined;
}
