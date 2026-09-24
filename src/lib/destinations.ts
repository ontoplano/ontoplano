import type { PlainKey } from '$lib/i18n/keys';
/**
 * Everywhere you can go, as data.
 *
 * The navigation, the command palette and — when it exists — the pie are three
 * renderings of this list rather than three lists that drift apart.
 */
import type { Pathname } from '$app/types';
import type { IconName } from '$lib/components/Icon.svelte';
import {
	isHidden,
	isHideableSection,
	ROOM_TABS,
	tabGlyph,
	type HideableSection
} from '$lib/sections';
import { NAV_PLACES } from '$lib/sections-nav';
import type { Translate } from '$lib/i18n/core';

export type Destination = {
	label: PlainKey;
	/** The room it belongs to, shown after the label in a flat list. */
	group?: PlainKey;
	/**
	 * A real route of this app, not a string that looks like one. `resolve()`
	 * only takes these, and typing it here means a destination pointing at a
	 * route that does not exist is a build error rather than a 404 somebody
	 * finds later.
	 */
	href: Pathname;
	icon: IconName;
	/** The preferences that put this row away — its own, and its room's. */
	hide: HideableSection[];
};

/**
 * The places that are not rooms of the bar: settings, reached from the account
 * menu rather than the wheel.
 */
const OUTSIDE_THE_ROOMS: Destination[] = [
	{
		label: 'app.account',
		group: 'rooms.settings.title',
		href: '/settings/account',
		icon: 'settings',
		hide: []
	},
	{
		label: 'app.preferences',
		group: 'rooms.settings.title',
		href: '/settings/preferences',
		icon: 'settings',
		hide: []
	},
	{
		label: 'app.integrations',
		group: 'rooms.settings.title',
		href: '/settings/integrations',
		icon: 'plug',
		hide: []
	}
];

/**
 * Every room of the bar, and every tab inside it — read off `NAV_PLACES` and
 * `ROOM_TABS`, the lists the bar, the wheel and the rooms' own strips draw. It
 * used to be written out here, and had drifted: no Workouts, no Finance, no
 * Media, and Inventory's two tabs as one entry.
 */
export const DESTINATIONS: Destination[] = [
	{ label: 'app.today', href: '/', icon: 'home', hide: [] },
	...NAV_PLACES.flatMap((place): Destination[] => {
		const room = place.hide ? [place.hide] : [];
		const tabs = ROOM_TABS[place.key];
		if (tabs.length === 0)
			return [{ label: place.name, href: place.href as Pathname, icon: place.icon, hide: room }];
		return tabs.map((tab) => ({
			label: tab.label,
			group: place.name,
			href: tab.href,
			icon: tabGlyph(tab, place.key) ?? place.icon,
			hide: tab.id && isHideableSection(tab.id) ? [...room, tab.id] : room
		}));
	}),
	...OUTSIDE_THE_ROOMS
];

/**
 * Subsequence matching, the way every palette works: `pltd` finds "Planner
 * todo". Returns a score so an exact prefix beats a scattered match.
 */
export function matchScore(haystack: string, needle: string): number | null {
	if (!needle) return 0;

	const h = haystack.toLowerCase();
	const n = needle.toLowerCase();
	if (h.startsWith(n)) return 1000 - h.length;
	if (h.includes(n)) return 500 - h.indexOf(n);

	let at = -1;
	let gaps = 0;
	for (const char of n) {
		const found = h.indexOf(char, at + 1);
		if (found === -1) return null;
		gaps += found - at - 1;
		at = found;
	}
	return 100 - gaps;
}

/**
 * The places matching what somebody typed, best first — matched against the
 * words on their screen, in their language, not against the catalogue keys.
 */
export function findDestinations(
	query: string,
	t: Translate,
	hidden: readonly string[] = []
): Destination[] {
	return DESTINATIONS.filter((d) => !d.hide.some((id) => isHidden(hidden, id)))
		.map((d) => ({
			d,
			score: matchScore(`${d.group ? t(d.group) : ''} ${t(d.label)}`.trim(), query)
		}))
		.filter((r): r is { d: Destination; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((r) => r.d);
}
