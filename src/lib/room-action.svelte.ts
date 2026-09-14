/**
 * The one thing a screen is for, said once and drawn in one place.
 *
 * Every tab used to build its own row of controls, and ten of them had drifted:
 * the New button filled on one screen and transparent on the next, right-
 * aligned here and left in Finance, and each tab's content starting at its own
 * height. A screen declares its primary verb here instead, and the room's bar
 * draws it — top right, one look, on every screen in the app.
 *
 * A page says what it is for:
 *
 *     setRoomAction(() => ({ label: 'New ledger', run: () => (showNew = true) }));
 *
 * and takes it back when it leaves, which the effect does on its own.
 */
import { onDestroy } from 'svelte';

export type RoomAction = {
	/** What the button says, e.g. "New ledger". The `+` is the bar's. */
	label: string;
	/** What pressing it does. Omit for `href`. */
	run?: () => void;
	/** Where it goes, for the screens whose primary verb is a page. */
	href?: string;
	/** The keyboard shortcut to print beside it, when there is one. */
	kbd?: string;
	/** A tour anchor, for the screens the tutorial walks. */
	tour?: string;
	/**
	 * Whether it opened an inline composer a second press closes. The button
	 * then reads "Cancel" — one control, not two that disagree.
	 */
	open?: boolean;
};

const held = $state<{ action: RoomAction | null }>({ action: null });

/** What the bar should draw, or null on a screen with no primary verb. */
export function roomAction(): RoomAction | null {
	return held.action;
}

/**
 * Declare this screen's primary verb.
 *
 * Takes a function rather than a value so the label and `open` stay live — a
 * composer that is open makes the same button say Cancel without the page
 * re-registering anything.
 */
export function setRoomAction(describe: () => RoomAction | null): void {
	$effect(() => {
		held.action = describe();
	});
	// And gone the moment the screen is: a stale action is a button that acts
	// on a page nobody is looking at.
	onDestroy(() => {
		held.action = null;
	});
}
