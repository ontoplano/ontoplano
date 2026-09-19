/**
 * A sentence the app says and then stops saying.
 *
 * The undo toast beside this is for an action you can take back, and it earns
 * its place by holding the window open. This is the other kind: "Saved", which
 * has nothing to take back and nothing to wait for — it is the app answering a
 * press that would otherwise look like it did nothing.
 *
 * Kept apart from `undo.svelte.ts` because the two are not the same thing, and
 * folding a message with no inverse into a store whose whole subject is the
 * inverse would make both harder to read. They share the float layer, though:
 * one place on the screen where the app speaks, or two stacks of toasts end up
 * sitting on top of each other.
 */

/** How long a plain message stays up. Long enough to read, short enough to ignore. */
export const SAID_MS = 2400;

export type Said = { id: number; message: string };

export const said = $state<{ items: Said[] }>({ items: [] });

let next = 1;

/**
 * Say something. Replaces whatever is up rather than stacking.
 *
 * Pressing Save four times should not leave four toasts: they all say the same
 * thing, and a column of them is the app shouting. The last one wins and its
 * timer starts again, which reads as one message that keeps being true.
 */
export function say(message: string): void {
	const id = next++;
	said.items = [{ id, message }];
	setTimeout(() => {
		said.items = said.items.filter((one) => one.id !== id);
	}, SAID_MS);
}
