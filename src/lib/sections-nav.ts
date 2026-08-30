import { SECTIONS, type SectionKey } from '$lib/colors';
import type { HideableSection } from '$lib/sections';
import type { IconName } from '$lib/components/Icon.svelte';

/**
 * The eight rooms, and the door into each.
 *
 * A section is where you are; a tab inside it is what you are doing. So the pie
 * lands you in the room and the tab strip that is already there does the rest —
 * two levels of gesture is where radial menus start being annoying, and depth
 * belongs in the palette, which can jump straight to a notebook or a recipe.
 *
 * Ordered clockwise from noon in the order they sit in the navbar, so the pie
 * and the bar agree about where things are.
 */
export type Room = {
	key: string;
	label: string;
	icon: IconName;
	color: string;
	/** The section's front door. */
	href: string;
	/** The preference that puts it away. */
	hide?: HideableSection;
};

/**
 * The first-class places, in the order the bar shows them.
 *
 * One list, two renderings: the navigation bar and the pie. They used to be
 * two lists — the bar had ten entries and the pie had eight — so Notebooks and
 * People were in the bar and simply absent from the pie, whatever the
 * preferences said. Anything that is a room in one of them has to be a room in
 * the other, and `sections-nav.test.ts` is what keeps that true.
 *
 * `section` is which room's colour and glyph it belongs to; `key` is its own
 * identity, because Notebooks and People live in the Diary section and are not
 * the Diary.
 */
export type NavPlace = {
	key: string;
	label: string;
	/** The section it belongs to — its colour, and the wash behind its pages. */
	section: SectionKey;
	icon: IconName;
	href: string;
	/** The preference that puts it away. Absent means always there. */
	hide?: HideableSection;
};

export const NAV_PLACES: NavPlace[] = [
	{ key: 'home', label: 'Home', section: 'home', icon: 'home', href: '/' },
	{ key: 'planner', label: 'Planner', section: 'planner', icon: 'planner', href: '/planner/plan' },
	{ key: 'goals', label: 'Goals', section: 'goals', icon: 'goals', href: '/goals', hide: 'goals' },
	{ key: 'diary', label: 'Diary', section: 'diary', icon: 'diary', href: '/diary', hide: 'diary' },
	{
		key: 'people',
		label: 'People',
		section: 'diary',
		icon: 'user',
		href: '/diary/people',
		hide: 'people'
	},
	{
		key: 'notebooks',
		label: 'Notebooks',
		section: 'diary',
		icon: 'notebook',
		href: '/diary/notebooks',
		hide: 'notebooks'
	},
	{ key: 'ideas', label: 'Ideas', section: 'ideas', icon: 'ideas', href: '/ideas', hide: 'ideas' },
	{
		key: 'health',
		label: 'Health',
		section: 'health',
		icon: 'health',
		href: '/health/habits',
		hide: 'health'
	},
	{
		key: 'shopping',
		label: 'Shopping',
		section: 'shopping',
		icon: 'shopping',
		href: '/shopping',
		hide: 'shopping'
	},
	{
		key: 'kitchen',
		label: 'Recipes',
		section: 'kitchen',
		icon: 'utensils',
		href: '/kitchen/recipes',
		hide: 'recipes'
	}
];

export const ROOMS: Room[] = NAV_PLACES.map((place) => ({
	key: place.key,
	label: place.label,
	icon: place.icon,
	color: SECTIONS[place.section].accent,
	href: place.href,
	hide: place.hide
}));

export function roomFor(key: string): Room | undefined {
	return ROOMS.find((r) => r.key === key);
}
