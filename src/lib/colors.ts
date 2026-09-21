import type { PlainKey } from './i18n/keys.js';

/**
 * Centralized color definitions for the entire app.
 * Edit this file to change colors across all routes.
 *
 * See README.md for documentation.
 */

// -- Layout ------------------------------------------------------------------

/** Main page background — deliberately neutral; colour belongs to the cards. */
export const PAGE_BG = 'bg-gray-100';

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
 * Every section owns a colour, used solid — a filled header band on its cards
 * and a filled tab in the nav. Never as tinted body text, and never as a wash
 * behind a whole page: pale hues over the entire viewport read as decoration
 * rather than structure, and washed-out text is just harder to read.
 *
 * The tones are deep on purpose. At these lightness levels white text clears
 * AA on every one of them, which is what makes a solid fill usable.
 *
 * Six hues cannot all stay distinct under red-green colour blindness — the
 * usable hue circle collapses to blue-ish versus yellow-ish. So they are spread
 * by lightness as well as hue, and colour is never the only cue: every filled
 * band is also labelled in words. Nothing here encodes good/bad, which is the
 * case the red/blue rule actually governs.
 */
export type SectionKey =
	| 'home'
	| 'planner'
	| 'goals'
	| 'diary'
	| 'ideas'
	| 'health'
	| 'finance'
	| 'inventory'
	| 'media';

export const SECTIONS: Record<SectionKey, { accent: string; name: PlainKey }> = {
	home: { accent: '#475569', name: 'sections.home.label' },
	planner: { accent: '#1d4ed8', name: 'sections.tasks.label' },
	goals: { accent: '#7c2d12', name: 'sections.goals.label' },
	diary: { accent: '#b45309', name: 'sections.notebooks.label' },
	ideas: { accent: '#6d28d9', name: 'sections.ideas.label' },
	health: { accent: '#0f766e', name: 'sections.health.label' },
	finance: { accent: '#155e63', name: 'sections.finance.label' },
	inventory: { accent: '#9d174d', name: 'sections.inventory.label' },
	media: { accent: '#86198f', name: 'sections.media.label' }
};

/** Which section a pathname belongs to. */
export function sectionFor(pathname: string): SectionKey {
	if (pathname.startsWith('/tasks')) return 'planner';
	if (pathname.startsWith('/goals')) return 'goals';
	if (pathname.startsWith('/health')) return 'health';
	if (pathname.startsWith('/finance')) return 'finance';
	// Ideas keeps its own colour inside the room, and the room's own comes
	// after it — a prefix test on the parent would swallow the child.
	if (pathname.startsWith('/notebooks/ideas')) return 'ideas';
	// The whole Notebooks room wears the diary section's colour, as the room
	// did when it lived at /diary.
	if (pathname.startsWith('/notebooks')) return 'diary';
	if (pathname.startsWith('/inventory')) return 'inventory';
	if (pathname.startsWith('/media')) return 'media';
	return 'home';
}

/** Dashboard card left-border colours, kept as the section accents. */
export const SECTION_COLORS = {
	planner: SECTIONS.planner.accent,
	health: SECTIONS.health.accent,
	finance: SECTIONS.finance.accent,
	diary: SECTIONS.diary.accent,
	inventory: SECTIONS.inventory.accent,
	ideas: SECTIONS.ideas.accent,
	home: SECTIONS.home.accent,
	goals: SECTIONS.goals.accent,
	media: SECTIONS.media.accent
} as const;

// -- Habits -------------------------------------------------------------------

/** Heatmap background classes (Tailwind) indexed by intensity 0-3 */
/**
 * How much of a habit's history the grid shows, and where the line is.
 *
 * A year is 52 columns of small squares, which is a wall on a phone: it
 * overflows sideways and compresses into something narrower than a thumb.
 * Ninety days is thirteen columns, fits, and is the span a habit is actually
 * judged over. The breakpoint is Tailwind's `sm`, which is where the rest of
 * the app stops being a phone.
 */
export const HEATMAP_YEAR = 365;
export const HEATMAP_SEASON = 90;
export const HEATMAP_FULL_YEAR_FROM = '640px';

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

// -- Tags ---------------------------------------------------------------------

/**
 * What the colour box opens on for a label that has never had one.
 *
 * A neutral grey rather than a hue: the box is a question, and opening it on
 * a colour makes it look like an answer somebody already gave.
 */
export const TAG_COLOR_DEFAULT = '#6b7280';
