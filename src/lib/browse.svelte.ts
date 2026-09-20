import { onDestroy } from 'svelte';

/**
 * The keys that walk a screen, declared once rather than per screen.
 *
 * Every list in the app had grown its own `handleKeydown`: the same `j` and
 * `k`, the same guard against firing while somebody is typing, the same clamp
 * at both ends — written eight times, with eight chances to drift. A screen
 * added later had to have somebody remember all of it.
 *
 * So a view says what it has instead, the way it says what its New button is
 * (`$lib/room-action`):
 *
 *     browsable(() => ({
 *       items: () => shownNotes,
 *       cursor: at,
 *       moveTo: (i) => (at = i),
 *       tabs: { of: TABS, current: tab, go: (k) => (tab = k) },
 *       edit: (i) => startEdit(shownNotes[i])
 *     }));
 *
 * and gets `h`/`l` across the tabs, `j`/`k` down the items, `Enter` to open
 * the one under the cursor and `e` to edit it. What a screen does not declare
 * it does not answer to — a view with no tabs simply leaves `h` and `l` alone.
 *
 * It does not replace a screen's own keys. Anything particular to it —
 * `t` for "pull onto today", `1`–`5` for a rating — stays in `$lib/shortcuts`
 * and in that screen's handler, and this runs first for the four it owns.
 */

/** What a screen has, described live so the handler always reads the current state. */
export type Browsing = {
	/** The rows, in the order they are on screen. */
	items: () => readonly unknown[];
	/** Where the cursor is, or -1 for nowhere. */
	cursor: () => number;
	/** Put it somewhere. Already clamped to the list. */
	moveTo: (index: number) => void;
	/** The tabs, if the screen has any. */
	tabs?: {
		of: readonly string[];
		current: () => string;
		go: (key: string) => void;
	};
	/** `Enter`: open what is under the cursor — read it, unfold it. */
	open?: (index: number) => void;
	/** `e`: edit what is under the cursor. */
	edit?: (index: number) => void;
};

/**
 * Whether the keystroke belongs to somebody writing rather than to the page.
 *
 * A dialog takes the keyboard outright — a form open over a list is where the
 * typing is going, and a list walking underneath it is the bug this prevents.
 */
function typing(event: KeyboardEvent): boolean {
	if (document.querySelector('dialog[open]')) return true;
	const target = event.target;
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

/** Declare what this screen can be walked through. Undone when it leaves. */
export function browsable(describe: () => Browsing): void {
	if (typeof window === 'undefined') return;

	const onKey = (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (typing(event)) return;

		const view = describe();
		const items = view.items();
		const at = view.cursor();

		switch (event.key) {
			case 'h':
			case 'l': {
				if (!view.tabs) return;
				const { of, current, go } = view.tabs;
				const now = of.indexOf(current());
				if (now === -1) return;
				// Stops at the ends rather than wrapping: a tab strip is a row you
				// read left to right, and arriving back at the first one from the
				// last reads as having lost your place.
				const next = event.key === 'l' ? Math.min(of.length - 1, now + 1) : Math.max(0, now - 1);
				if (next === now) return;
				event.preventDefault();
				go(of[next]);
				return;
			}
			case 'j':
			case 'k': {
				if (items.length === 0) return;
				event.preventDefault();
				// From nowhere, `j` starts at the top and `k` at the bottom, which
				// is what somebody means by pressing either on a list they have not
				// touched yet.
				if (at < 0) {
					view.moveTo(event.key === 'j' ? 0 : items.length - 1);
					return;
				}
				const next = event.key === 'j' ? at + 1 : at - 1;
				view.moveTo(Math.min(items.length - 1, Math.max(0, next)));
				return;
			}
			case 'Enter': {
				if (!view.open || at < 0 || at >= items.length) return;
				event.preventDefault();
				view.open(at);
				return;
			}
			case 'e': {
				if (!view.edit || at < 0 || at >= items.length) return;
				event.preventDefault();
				view.edit(at);
				return;
			}
		}
	};

	window.addEventListener('keydown', onKey);
	onDestroy(() => window.removeEventListener('keydown', onKey));
}
