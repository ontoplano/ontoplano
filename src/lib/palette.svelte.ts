/**
 * Whether the command palette is showing.
 *
 * A module-level rune rather than a prop or an event: the palette is mounted
 * once in the layout, and the things that open it — a button in the header, a
 * shortcut, later a wedge of the pie — are nowhere near it in the tree.
 */
export const palette = $state({ open: false });
