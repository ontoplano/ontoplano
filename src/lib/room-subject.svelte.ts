import { onDestroy, type Snippet } from 'svelte';

/**
 * The one thing a room is showing, said in the room's own bar.
 *
 * Opening a notebook on a phone used to leave the bar saying "Notebooks" and
 * draw the notebook again underneath it: its picture, its name and a row of
 * buttons, a second header taking a sixth of the screen before anything that
 * was in it. Now the page names its subject here and the bar wears it — the
 * picture and the name where the room's glyph and name were, and the
 * subject's verbs behind the bar's ⋮ as a list of icons with their words.
 * Leaving the subject — another tab, the list — gives the bar back.
 */
export type RoomSubject = {
	title: string;
	/** A picture to stand where the room's glyph does, if it has one. */
	pictureId?: number | null;
	/** The subject's verbs, drawn as rows of the bar's ⋮ menu: `.btn` with an icon and a word. */
	menu: Snippet;
};

const held = $state<{ subject: RoomSubject | null; by: symbol | null }>({
	subject: null,
	by: null
});

/** What the bar is showing instead of the room, if anything. */
export function roomSubject(): RoomSubject | null {
	return held.subject;
}

/**
 * Name the subject for as long as this component is on screen — or while
 * `describe` answers something; null gives the bar back.
 */
export function setRoomSubject(describe: () => RoomSubject | null): void {
	const mine = Symbol('subject');
	$effect(() => {
		const subject = describe();
		if (subject) {
			held.subject = subject;
			held.by = mine;
		} else if (held.by === mine) {
			held.subject = held.by = null;
		}
	});
	onDestroy(() => {
		if (held.by === mine) held.subject = held.by = null;
	});
}
