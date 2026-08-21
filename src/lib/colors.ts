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
 * case the red/blue rule in AGENTS.md actually governs.
 */
export type SectionKey = 'home' | 'planner' | 'goals' | 'diary' | 'ideas' | 'health' | 'shopping';

export const SECTIONS: Record<SectionKey, { accent: string; label: string }> = {
	home: { accent: '#475569', label: 'Home' },
	planner: { accent: '#1d4ed8', label: 'Planner' },
	goals: { accent: '#7c2d12', label: 'Goals' },
	diary: { accent: '#b45309', label: 'Diary' },
	ideas: { accent: '#6d28d9', label: 'Ideas' },
	health: { accent: '#0f766e', label: 'Health' },
	shopping: { accent: '#9d174d', label: 'Shopping' }
};

/** Which section a pathname belongs to. */
export function sectionFor(pathname: string): SectionKey {
	if (pathname.startsWith('/planner')) return 'planner';
	if (pathname.startsWith('/goals')) return 'goals';
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
	home: SECTIONS.home.accent,
	goals: SECTIONS.goals.accent
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
