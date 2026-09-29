/**
 * A grid whose cells pack up under each other rather than sitting in rows.
 *
 * A grid row is as tall as its tallest cell, so a short card beside a long
 * one left a hole under it the height of the difference — a one-line card
 * beside a list of nine was a white field in the middle of the page. Here the
 * rows are a few pixels tall and each cell spans as many as its own height
 * needs, so the next card starts where this one ends. With the grid's
 * `grid-flow-dense`, a half-width card fills whatever gap is left above it.
 *
 * The cells must not stretch (`items-start`), or their height would be the
 * span's rather than their content's. Until the first measurement the grid is
 * left as it was drawn on the server, which is the unpacked layout rather
 * than a pile of overlapping cells.
 */

/** How tall one packing row is, in pixels: the rounding a card's height gets. */
const ROW_PX = 4;

export function packed(node: HTMLElement) {
	function pack() {
		const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
		for (const cell of node.children) {
			if (!(cell instanceof HTMLElement)) continue;
			const height = cell.getBoundingClientRect().height;
			cell.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + gap) / ROW_PX))}`;
		}
		node.style.gridAutoRows = `${ROW_PX}px`;
		node.style.rowGap = '0';
	}

	const sizes = new ResizeObserver(pack);
	const watch = () => {
		sizes.disconnect();
		for (const cell of node.children) sizes.observe(cell);
		pack();
	};
	const cells = new MutationObserver(watch);
	cells.observe(node, { childList: true });
	watch();

	return {
		destroy() {
			sizes.disconnect();
			cells.disconnect();
		}
	};
}
