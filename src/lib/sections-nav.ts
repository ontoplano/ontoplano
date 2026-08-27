import { SECTIONS, type SectionKey } from '$lib/colors';
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
	key: SectionKey;
	label: string;
	icon: IconName;
	color: string;
	/** The section's front door. */
	href: string;
};

const DOORS: Record<SectionKey, { icon: IconName; href: string }> = {
	home: { icon: 'home', href: '/' },
	planner: { icon: 'planner', href: '/planner/plan' },
	goals: { icon: 'goals', href: '/goals' },
	diary: { icon: 'diary', href: '/diary' },
	ideas: { icon: 'ideas', href: '/ideas' },
	health: { icon: 'health', href: '/health/habits' },
	shopping: { icon: 'shopping', href: '/shopping' },
	kitchen: { icon: 'note', href: '/kitchen/recipes' }
};

export const ROOMS: Room[] = (Object.keys(DOORS) as SectionKey[]).map((key) => ({
	key,
	label: SECTIONS[key].label,
	icon: DOORS[key].icon,
	color: SECTIONS[key].accent,
	href: DOORS[key].href
}));

export function roomFor(key: string): Room | undefined {
	return ROOMS.find((r) => r.key === key);
}
