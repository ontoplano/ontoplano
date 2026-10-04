/**
 * Whether the command palette is showing.
 *
 * A module-level rune rather than a prop or an event: the palette is mounted
 * once in the layout, and the things that open it — a button in the header, a
 * shortcut, later a wedge of the pie — are nowhere near it in the tree.
 */
export const palette = $state({ open: false });

/**
 * Whether this key press asks for the palette.
 *
 * Ctrl/Cmd+K anywhere, and `/` when nothing is being typed into — because
 * Ctrl+K is the browser's own search box in Firefox and this should not be a
 * fight over a key. Answered here rather than inside the palette, which is
 * not loaded until the first time it is wanted; the shell asks this on every
 * key and fetches the palette on a yes.
 */
export function opensPalette(e: KeyboardEvent): boolean {
	if (palette.open) return false;
	if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return true;
	const typing =
		e.target instanceof HTMLInputElement ||
		e.target instanceof HTMLTextAreaElement ||
		e.target instanceof HTMLSelectElement;
	return e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
}
