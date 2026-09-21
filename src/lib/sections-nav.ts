import { SECTIONS, type SectionKey } from '$lib/colors';
import type { PlainKey } from './i18n/keys.js';
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
	/**
	 * What it is called, as a message key rather than a word.
	 *
	 * This list is drawn by the bar, the pie, the palette and the preferences
	 * page, and none of them is a good place for a language to be decided. They
	 * each have a translator; this says which message to ask it for.
	 *
	 * `PlainKey` and not any key: a room's name is a name, and a message that
	 * needs a value handed to it is not one.
	 */
	name: PlainKey;
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
 * **Home is not on this list.** The wordmark in the corner of the header is the
 * way home, the way it is in every app with a logo in its corner, and the pie
 * has never offered one. A Home tab beside that wordmark is the same door drawn
 * twice — and because a stored order does not mention rooms it has never heard
 * of, it drifted to the far end of the bar, which is the one place a way home
 * should never be.
 *
 * `section` is which room's colour and glyph it belongs to; `key` is its own
 * identity, because People lives in the Notebooks section and is not the diary.
 * Notebooks names the room and its first tab; the diary is the second,
 * which is where somebody looking for their notes actually looks.
 */
export type NavPlace = {
	key: string;
	/** What it is called — a message key; see `Room`. */
	name: PlainKey;
	/** The section it belongs to — its colour, and the wash behind its pages. */
	section: SectionKey;
	icon: IconName;
	href: string;
	/** The preference that puts it away. Absent means always there. */
	hide?: HideableSection;
};

/*
 * The order the rooms come in, as Estevão asked for it: the week first, then
 * what is written down, then the body, then the things in the house, then the
 * money, then what it is all for, then the pictures, then what is about to go
 * off. It was the order they happened to be written in.
 *
 * This is only the *default*: an account can drag them into any order it
 * likes and that choice is stored — `applyOrder` keeps anything stored and
 * puts a room it has never heard of at the end, so changing this list moves
 * nobody who has already chosen.
 */
export const NAV_PLACES: NavPlace[] = [
	{
		key: 'planner',
		name: 'sections.tasks.label',
		section: 'planner',
		icon: 'planner',
		href: '/tasks/plan'
	},
	{
		key: 'diary',
		name: 'sections.notebooks.label',
		section: 'diary',
		icon: 'diary',
		href: '/notebooks',
		hide: 'diary'
	},
	{
		key: 'health',
		name: 'sections.health.label',
		section: 'health',
		icon: 'health',
		href: '/health/habits',
		hide: 'health'
	},
	{
		key: 'inventory',
		name: 'sections.inventory.label',
		section: 'inventory',
		icon: 'shopping',
		href: '/inventory',
		hide: 'inventory'
	},
	{
		key: 'finance',
		name: 'sections.finance.label',
		section: 'finance',
		icon: 'wallet',
		href: '/finance/ledgers',
		hide: 'finance'
	},
	{
		key: 'goals',
		name: 'sections.goals.label',
		section: 'goals',
		icon: 'goals',
		href: '/goals',
		hide: 'goals'
	},
	{
		key: 'media',
		name: 'sections.media.label',
		section: 'media',
		icon: 'image',
		href: '/media/audios',
		hide: 'media'
	},
	// Everything with a time on it, in one place. It has no colour of its own:
	// a reminder belongs to whatever it is about, so the room borrows the
	// planner's, which is where most of them come from.
	{
		key: 'reminders',
		name: 'sections.reminders.label',
		section: 'planner',
		icon: 'clock',
		href: '/reminders'
	}
];

export const ROOMS: Room[] = NAV_PLACES.map((place) => ({
	key: place.key,
	name: place.name,
	icon: place.icon,
	color: SECTIONS[place.section].accent,
	href: place.href,
	hide: place.hide
}));

export function roomFor(key: string): Room | undefined {
	return ROOMS.find((r) => r.key === key);
}
