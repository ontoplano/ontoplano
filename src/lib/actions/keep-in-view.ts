/**
 * Keep the selected row on the screen.
 *
 * `j` and `k` move a cursor through a list, and the cursor happily walked off
 * the bottom of the window: you could keep pressing `j` while the page stood
 * still, selecting things you could not see. This scrolls the row into view as
 * it becomes the selected one, by the smallest amount that works — a row
 * already visible does not move the page at all.
 */
export function keepInView(node: HTMLElement, selected: boolean) {
	// What it was when the row appeared. Nothing is revealed on mount: the diary
	// can be opened at `#diary-7`, and scrolling the row that happens to be
	// selected into view would drag the reader away from the entry they asked
	// for.
	let was = selected;

	const reveal = () => {
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		node.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
	};

	return {
		update(next: boolean) {
			if (next && !was) reveal();
			was = next;
		}
	};
}
