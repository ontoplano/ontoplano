/**
 * The sections a person can put away.
 *
 * Not everybody keeps a diary or tracks meals, and a navbar full of rooms you
 * never enter makes the whole app read as someone else's. Hiding a section
 * takes it out of the menus — the navbar, the pies, the palette's places, the
 * dashboard cards, the capture wedges — and nothing else: the pages still
 * answer at their URLs and the data sits untouched, so turning a section back
 * on is a toggle, not a restore.
 *
 * Home and the planner are not on this list on purpose. They are the app; an
 * account that hides the planner has hidden ontoplano.
 */
export const HIDEABLE_SECTIONS = [
	{ id: 'goals', label: 'Goals' },
	{ id: 'diary', label: 'Diary' },
	{ id: 'people', label: 'People' },
	{ id: 'notebooks', label: 'Notebooks' },
	{ id: 'ideas', label: 'Ideas' },
	{ id: 'health', label: 'Health' },
	{ id: 'shopping', label: 'Shopping' },
	{ id: 'recipes', label: 'Recipes' }
] as const;

export type HideableSection = (typeof HIDEABLE_SECTIONS)[number]['id'];

export function isHideableSection(value: string): value is HideableSection {
	return HIDEABLE_SECTIONS.some((s) => s.id === value);
}
