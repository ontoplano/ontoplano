import type { Pathname } from '$app/types';
import { DESTINATIONS, type Destination } from '$lib/destinations';

/**
 * The routes that live inside the same room as this one.
 *
 * Ontoplano's addresses are two deep. The first segment is a room — `tasks`,
 * `notebooks`, `health`, `settings` — and what follows is one of the places
 * inside it: `/tasks/board`, `/notebooks/diary`. `J` and `K` have always
 * walked the rooms; this is what lets `H` and `L` walk the places inside the
 * one you are in, without any screen being told about it.
 *
 * Read off the path rather than off `Destination.group`, because the group is
 * a heading in a menu and does not have to agree with the address: `/notebooks
 * /ideas` is grouped under "Writing" and is still, by every meaning that
 * matters to somebody pressing a key, inside Notebooks.
 *
 * A room with one place in it — Today, Goals, Inventory — gives back that one
 * place, and the keys then have nowhere to go, which is the right amount of
 * nothing to happen.
 */
export function roomOf(pathname: string): string {
	return pathname.split('/')[1] ?? '';
}

/**
 * Everywhere inside the room this path is in, in the order the menu lists them.
 *
 * `hidden` is the account's put-away sections. A place somebody has hidden is
 * not somewhere a key should land them: hiding is a menu matter and the route
 * keeps answering, but walking onto it by accident is not what the menu said.
 */
export function placesInRoom(pathname: string, hidden: readonly string[] = []): Destination[] {
	const room = roomOf(pathname);
	if (!room) return [];
	return DESTINATIONS.filter(
		(d) => roomOf(d.href) === room && (!d.hide || !hidden.includes(d.hide))
	);
}

/**
 * The next place inside this room, wrapping at the end.
 *
 * `null` when there is nowhere else to go — one place in the room, or a path
 * that is not among the destinations at all. The caller then does nothing,
 * rather than guessing at a first entry the person did not ask for.
 */
export function stepWithinRoom(
	pathname: string,
	step: 1 | -1,
	hidden: readonly string[] = []
): Pathname | null {
	const places = placesInRoom(pathname, hidden);
	if (places.length < 2) return null;

	// The longest matching href, so `/notebooks/diary` is not answered by
	// `/notebooks` merely because the one is a prefix of the other.
	let at = -1;
	let best = -1;
	places.forEach((place, i) => {
		const matches = pathname === place.href || pathname.startsWith(`${place.href}/`);
		if (matches && place.href.length > best) {
			best = place.href.length;
			at = i;
		}
	});
	if (at === -1) return null;

	return places[(at + step + places.length) % places.length].href;
}
