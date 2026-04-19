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

// -- Dashboard section card left-border colors --------------------------------

export const SECTION_COLORS = {
	planner: 'rgba(59, 130, 246, 0.6)',
	habits: 'rgba(6, 182, 212, 0.6)',
	diary: 'rgba(234, 179, 8, 0.6)',
	beliefs: 'rgba(168, 85, 247, 0.6)',
	shopping: 'rgba(249, 115, 22, 0.6)',
	services: 'rgba(34, 197, 94, 0.6)'
} as const;

// -- Beliefs graph ------------------------------------------------------------

/** Island indicator colors (10-color palette, curated for distinguishability) */
export const ISLAND_COLORS = [
	'#6366f1',
	'#f59e0b',
	'#10b981',
	'#ef4444',
	'#8b5cf6',
	'#06b6d4',
	'#f97316',
	'#ec4899',
	'#14b8a6',
	'#84cc16'
] as const;

/** Relation / edge colors */
export const RELATION_SUPPORTS_COLOR = '#3b82f6';
export const RELATION_CONTRADICTS_COLOR = '#ef4444';

/** Relation type picker styles (inline) */
export const SUPPORTS_STYLE = { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' };
export const CONTRADICTS_STYLE = { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' };

/** Belief node valence colors */
export const VALENCE_POSITIVE = { bg: '#eff6ff', border: '#93c5fd' };
export const VALENCE_NEGATIVE = { bg: '#fef2f2', border: '#fca5a5' };
export const VALENCE_NEUTRAL = { bg: '#f9fafb', border: '#d1d5db' };

/** Valence indicator (small colored dot in detail panel) */
export const VALENCE_DOT = { positive: '#22c55e', negative: '#ef4444', neutral: '#9ca3af' };

/** Evidence node colors */
export const EVIDENCE_NODE = { bg: '#fefce8', border: '#fde68a' };

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
