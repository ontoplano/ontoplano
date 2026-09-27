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

import { undo } from '$lib/undo.svelte';
import { DEFAULT_UNDO_SECONDS } from '$lib/instance-defaults';

/** How long a plain message stays up. Long enough to read, short enough to ignore. */
export const SAID_MS = 2400;

/**
 * Something to press, for a message where there is an obvious next move.
 *
 * "Task added" with an Edit button is the case this exists for: the thing you
 * most often want after making a task is to say more about it, and hunting the
 * list for the row you just made is the long way round. Deliberately not an
 * undo — you asked for the task, it is there, and taking it back is what
 * delete is for. `undo.svelte.ts` is the store for things with an inverse.
 */
export type SaidAction = { label: string; run: () => void };

export type Said = {
	id: number;
	message: string;
	action?: SaidAction;
	/** When it goes. */
	until: number;
	/** How long it was given, so a counted one can show it running down. */
	window: number;
};

export const said = $state<{ items: Said[] }>({ items: [] });

let next = 1;

/**
 * How long a message with something to press stays up: the undo window.
 *
 * Offering Edit for two and a half seconds was offering it to nobody, and
 * the undo beside it counted five. Both are a press on offer, so both hold
 * the same window — the instance's, or the default where an instance has
 * turned undo off, since a receipt still wants its Edit.
 */
export function actionWindowMs(): number {
	return (undo.seconds > 0 ? undo.seconds : DEFAULT_UNDO_SECONDS) * 1000;
}

/**
 * Say something. Replaces whatever is up rather than stacking.
 *
 * Pressing Save four times should not leave four toasts: they all say the same
 * thing, and a column of them is the app shouting. The last one wins.
 */
export function say(message: string, action?: SaidAction): void {
	const id = next++;
	const ms = action ? actionWindowMs() : SAID_MS;
	said.items = [{ id, message, action, until: Date.now() + ms, window: ms }];
	setTimeout(() => unsay(id), ms);
}

/** Take one down — pressing its action does, before running it. */
export function unsay(id: number): void {
	said.items = said.items.filter((one) => one.id !== id);
}
