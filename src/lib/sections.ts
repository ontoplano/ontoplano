import type { Translate } from './i18n/index.js';

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
 *
 * Each one is an id and nothing else. What it is called and the sentence that
 * says what it is for live in `messages/`, like every other word — reached
 * through `sectionLabel` and `sectionBlurb` below, which is also what makes the
 * same sentence appear in first run and in preferences without being written
 * twice and disagreeing with itself.
 */
/**
 * What can be put away, and where it sits.
 *
 * Two levels, because the menu is: a room, and the tabs inside it. Hiding
 * Health takes the whole room; hiding Recipes takes one tab and leaves
 * Workouts where it is — which is the thing this list could not express when
 * it was flat, so Recipes was listed beside Health as though they were peers.
 *
 * `parent` is the room a leaf lives in. A room has none.
 */
export const HIDEABLE_SECTIONS = [
	{ id: 'goals' },
	{ id: 'diary' },
	{ id: 'people' },
	{ id: 'notebooks' },
	{ id: 'ideas' },
	{ id: 'health' },
	{ id: 'finance' },
	{ id: 'inventory' },
	{ id: 'gallery' },
	{ id: 'recipes', parent: 'health' },
	{ id: 'habits', parent: 'health' },
	{ id: 'workouts', parent: 'health' }
] as const;

/**
 * The rooms themselves, without the tabs inside them.
 *
 * First run asks which rooms somebody wants; asking about Habits and Workouts
 * separately from Health is a question nobody has an opinion about before
 * they have used the app. The full tree belongs in Preferences, where
 * somebody goes on purpose.
 */
export const HIDEABLE_ROOMS = HIDEABLE_SECTIONS.filter((s) => !('parent' in s));

/** A room's own tabs, in the order the room shows them. */
export function leavesOf(room: string): HideableSection[] {
	return HIDEABLE_SECTIONS.filter(
		(s): s is typeof s & { parent: string } => 'parent' in s && s.parent === room
	).map((s) => s.id as HideableSection);
}

/**
 * What a section is called, and the sentence that says what it is for.
 *
 * By key rather than by field: `sections.goals.label` and `sections.goals.blurb`
 * are in `messages/`, like every other word, and the compiler checks that each
 * id has both — add a section without them and this stops building.
 *
 * The sentence is here rather than written twice because it is needed in two
 * places that must not disagree: first run, where somebody is choosing rooms
 * they have never seen, and preferences, where they are reconsidering.
 */
export function sectionLabel(t: Translate, id: HideableSection): string {
	return t(`sections.${id}.label`);
}

export function sectionBlurb(t: Translate, id: HideableSection): string {
	return t(`sections.${id}.blurb`);
}

/**
 * Whether a tab is put away — by itself, or by its room being put away.
 *
 * A room that is hidden hides what is inside it; asking about the leaf alone
 * would leave a tab strip standing inside a room nobody can reach.
 */
export function isHidden(hidden: readonly string[], id: HideableSection): boolean {
	if (hidden.includes(id)) return true;
	const leaf = HIDEABLE_SECTIONS.find((s) => s.id === id);
	const parent = leaf && 'parent' in leaf ? (leaf.parent as string) : null;
	return parent !== null && hidden.includes(parent);
}

export type HideableSection = (typeof HIDEABLE_SECTIONS)[number]['id'];

export function isHideableSection(value: string): value is HideableSection {
	return HIDEABLE_SECTIONS.some((s) => s.id === value);
}
