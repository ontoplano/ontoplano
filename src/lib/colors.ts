/**
 * Centralized color definitions for the entire app.
 * Edit this file to change colors across all routes.
 *
 * See README.md for documentation.
 */

// -- Layout ------------------------------------------------------------------

/** Main page background */
export const PAGE_BG = 'bg-gray-50';

/** Navbar */
export const NAV_BG = 'bg-white';
export const NAV_BORDER = 'border-gray-200';
export const NAV_LOGO_TEXT = 'text-gray-900';
export const NAV_LINK = 'text-gray-500 hover:text-gray-900';
export const NAV_LINK_ACTIVE = 'text-gray-900 underline underline-offset-4';
export const NAV_USER_TEXT = 'text-gray-500';
export const NAV_MENU_BTN = 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50';
export const NAV_DROPDOWN_BG = 'border-gray-200 bg-white';
export const NAV_DROPDOWN_ITEM = 'text-gray-700 hover:bg-gray-50';

// -- Section identity ---------------------------------------------------------

/**
 * Every section owns a colour, used for its nav link, the wash behind its
 * pages, and the cards that report into it on the dashboard.
 *
 * Six hues cannot all stay distinct under red-green colour blindness — the
 * usable hue circle collapses to blue-ish versus yellow-ish. So these are
 * spread by *lightness* as well as hue, and the colour is never the only cue:
 * every place one appears is also labelled in words. Nothing here encodes
 * good/bad, which is the case the red/blue rule in AGENTS.md actually governs.
 *
 * `accent` is for borders, active nav and headings. `tint` is a large-area
 * fill, pale enough for black body text to stay at AA contrast on it.
 */
export type SectionKey = 'home' | 'planner' | 'diary' | 'ideas' | 'health' | 'shopping';

export const SECTIONS: Record<SectionKey, { accent: string; tint: string; label: string }> = {
	home: { accent: '#4f46e5', tint: '#eef2ff', label: 'Home' },
	planner: { accent: '#0284c7', tint: '#eff6ff', label: 'Planner' },
	diary: { accent: '#d97706', tint: '#fffbeb', label: 'Diary' },
	ideas: { accent: '#7c3aed', tint: '#f5f3ff', label: 'Ideas' },
	health: { accent: '#0d9488', tint: '#f0fdfa', label: 'Health' },
	shopping: { accent: '#c026d3', tint: '#fdf4ff', label: 'Shopping' }
};

/** Which section a pathname belongs to. */
export function sectionFor(pathname: string): SectionKey {
	if (pathname.startsWith('/planner')) return 'planner';
	if (pathname.startsWith('/health')) return 'health';
	if (pathname.startsWith('/diary')) return 'diary';
	if (pathname.startsWith('/ideas')) return 'ideas';
	if (pathname.startsWith('/shopping')) return 'shopping';
	return 'home';
}

/** Dashboard card left-border colours, kept as the section accents. */
export const SECTION_COLORS = {
	planner: SECTIONS.planner.accent,
	health: SECTIONS.health.accent,
	diary: SECTIONS.diary.accent,
	shopping: SECTIONS.shopping.accent,
	ideas: SECTIONS.ideas.accent,
	home: SECTIONS.home.accent
} as const;

// -- Habits -------------------------------------------------------------------

/** Heatmap background classes (Tailwind) indexed by intensity 0-3 */
export const HEATMAP_BAD = ['bg-slate-100', 'bg-red-300', 'bg-red-500', 'bg-red-700'] as const;
export const HEATMAP_GOOD = ['bg-slate-100', 'bg-blue-300', 'bg-blue-500', 'bg-blue-700'] as const;
export const HEATMAP_NEUTRAL = [
	'bg-slate-100',
	'bg-gray-300',
	'bg-gray-500',
	'bg-gray-700'
] as const;

/** Habit accent border (inline style) */
export const HABIT_BAD_ACCENT = '#ef4444';
export const HABIT_GOOD_ACCENT = '#3b82f6';
export const HABIT_NEUTRAL_ACCENT = '#6b7280';

// -- Category fallback --------------------------------------------------------

/** Default color when category has no color set */
export const CATEGORY_FALLBACK_COLOR = '#d1d5db';
export const CATEGORY_FALLBACK_LIGHT = '#f3f4f6';
export const CATEGORY_DEFAULT_NEW = '#6b7280';
