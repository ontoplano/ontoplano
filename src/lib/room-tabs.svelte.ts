/**
 * The places inside the room you are in, as the room itself lists them.
 *
 * `H` and `L` walk these. They used to be worked out from `$lib/destinations`,
 * which is the menu's list and not the room's, and that was wrong in three
 * separate ways at once: the order was the menu's rather than the strip's, so
 * pressing `L` went sideways in an order nobody could see; a place missing
 * from the menu — a notebook's weekly notes — was skipped; and a room with no
 * menu entries at all, Media and Finance, answered to nothing.
 *
 * `TabbedRoom` already knows the answer, because it is the thing drawing the
 * strip. So it says so, and the shell reads it. One list, and the keys cannot
 * disagree with what is on the screen.
 */

export type RoomTab = { href: string; label: string };

/** What the room on screen is showing, or nothing on a screen with no strip. */
const tabs = $state<{ of: RoomTab[] }>({ of: [] });

/** Set by `TabbedRoom` as it draws, cleared as it leaves. */
export function setRoomTabs(next: RoomTab[]): void {
	tabs.of = next;
}

export function roomTabs(): RoomTab[] {
	return tabs.of;
}

/**
 * Where `H` or `L` goes from here, or null when there is nowhere.
 *
 * Matched by the longest tab whose path this is inside, so `/notebooks/12` —
 * a notebook being read — steps from Notebooks rather than giving up, and
 * `/notebooks` does not claim `/notebooks/diary` merely by being its prefix.
 */
export function stepThroughRoom(pathname: string, step: 1 | -1): string | null {
	const of = tabs.of;
	if (of.length < 2) return null;

	let at = -1;
	let best = -1;
	of.forEach((tab, i) => {
		const inside = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
		if (inside && tab.href.length > best) {
			best = tab.href.length;
			at = i;
		}
	});
	if (at === -1) return null;

	return of[(at + step + of.length) % of.length].href;
}
