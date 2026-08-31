/**
 * Say which way a row continues, when it continues.
 *
 * A row of tabs that does not fit scrolls, and a scrolling row that gives no
 * sign of it is a row with a tab nobody finds: the planner's Review sat past
 * the right edge on a phone, and the only clue was the browser's own scrollbar
 * — a grey bar drawn under the Settings tabs that read as a broken underline
 * rather than as "there is more this way".
 *
 * So the scrollbar is hidden and the fact is stated instead. This sets
 * `data-more="left" | "right" | "both" | "none"` on the element, and the CSS
 * for `.scroll-hints` draws a fade and a chevron on whichever side has more.
 *
 * Watched rather than measured once: the row's width changes with the window,
 * and its contents change when a tab appears — Administration only exists for
 * an administrator.
 */
export function scrollHints(node: HTMLElement) {
	const update = () => {
		// A pixel of slack: sub-pixel layout leaves scrollLeft at 0.4 at rest,
		// which would otherwise claim there is something to the left forever.
		const left = node.scrollLeft > 1;
		const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
		node.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
	};

	update();
	node.addEventListener('scroll', update, { passive: true });

	const observer = new ResizeObserver(update);
	observer.observe(node);
	for (const child of node.children) observer.observe(child);

	return {
		destroy() {
			node.removeEventListener('scroll', update);
			observer.disconnect();
		}
	};
}
