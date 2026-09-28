import { onDestroy } from 'svelte';

/**
 * What the browser tab says, built one way for every screen.
 *
 * Pages wrote their own `<title>` and had drifted: "Search · ontoplano" in
 * lower case, "Reminders · Ontoplano" without the instance's own name, and
 * every settings page calling itself "Home" because the shell took the
 * section's name. Now the shell builds every title with `titleOf`, from the
 * tab you are on and the room it is in; a page that is in no room says what
 * it is with `setPageTitle`, and never writes a `<title>` itself.
 */

/** Between the parts of a title, most specific first. */
export const TITLE_SEPARATOR = ' · ';

/**
 * A title from its parts, most specific first, ending in the app's name.
 *
 * Empty parts drop out, and a part equal to the one before it is said once —
 * the Notebooks tab of the Notebooks room is "Notebooks", not "Notebooks ·
 * Notebooks".
 */
export function titleOf(parts: readonly (string | null | undefined)[], appName: string): string {
	const said: string[] = [];
	for (const part of parts) {
		const clean = part?.trim();
		if (clean && clean !== said.at(-1)) said.push(clean);
	}
	if (said.at(-1) !== appName) said.push(appName);
	return said.join(TITLE_SEPARATOR);
}

const held = $state<{
	page: string[] | null;
	room: string | null;
	pageBy: symbol | null;
	roomBy: symbol | null;
}>({ page: null, room: null, pageBy: null, roomBy: null });

/** The parts a page declared, if it declared any. */
export function declaredTitle(): string[] | null {
	return held.page;
}

/** The name the room's bar is showing, if a room is on screen. */
export function roomTitle(): string | null {
	return held.room;
}

/**
 * The title of a screen that is not a room's tab — terms, the offline page,
 * an error — most specific part first. Kept until the page goes.
 */
export function setPageTitle(describe: () => string | string[]): void {
	const mine = Symbol('page');
	$effect(() => {
		const parts = describe();
		held.page = Array.isArray(parts) ? parts : [parts];
		held.pageBy = mine;
	});
	// Only its own: the next screen may already have said what it is.
	onDestroy(() => {
		if (held.pageBy === mine) held.page = held.pageBy = null;
	});
}

/** The room's bar says its name, so the tab can say it too. */
export function setRoomTitle(describe: () => string): void {
	const mine = Symbol('room');
	$effect(() => {
		held.room = describe();
		held.roomBy = mine;
	});
	onDestroy(() => {
		if (held.roomBy === mine) held.room = held.roomBy = null;
	});
}
