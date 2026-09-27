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
 * for `.scroll-hints` fades out whichever side has more. A fade and no more
 * than that: the chevron it used to draw looked like a button in a strip whose
 * whole point is that you drag it.
 *
 * Watched rather than measured once: the row's width changes with the window,
 * and its contents change when a tab appears — Administration only exists for
 * an administrator.
 */
/**
 * How far clear of an edge the chosen item is brought: past the fade, so the
 * tab you are on is never the one dissolving.
 */
const REVEAL_CLEARANCE_PX = 32;

/** What marks the item you are on, in a strip of links or of choices. */
const CURRENT =
	':scope > :is([aria-current="page"], [aria-current="true"], [aria-selected="true"])';

export function scrollHints(node: HTMLElement) {
	/*
	 * And the one you are on is on screen.
	 *
	 * On a phone Weekly notes, People and Tags were past the right edge of
	 * their own strip on arrival, so the strip said nothing about where you
	 * were. Horizontal only, and by the least that works — never the page.
	 */
	const reveal = (smooth: boolean) => {
		const current = node.querySelector<HTMLElement>(CURRENT);
		if (!current || node.scrollWidth <= node.clientWidth) return;
		const start = current.offsetLeft - REVEAL_CLEARANCE_PX;
		const end = current.offsetLeft + current.offsetWidth + REVEAL_CLEARANCE_PX;
		let to = node.scrollLeft;
		if (start < to) to = start;
		else if (end > to + node.clientWidth) to = end - node.clientWidth;
		if (Math.abs(to - node.scrollLeft) < 1) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		node.scrollTo({ left: Math.max(0, to), behavior: smooth && !still ? 'smooth' : 'auto' });
	};

	const update = () => {
		// A pixel of slack: sub-pixel layout leaves scrollLeft at 0.4 at rest,
		// which would otherwise claim there is something to the left forever.
		const left = node.scrollLeft > 1;
		const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
		node.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : 'none';
	};

	reveal(false);
	// Again once the fonts and the rest of the row have settled.
	requestAnimationFrame(() => reveal(false));
	update();
	node.addEventListener('scroll', update, { passive: true });

	const observer = new ResizeObserver(update);
	observer.observe(node);
	for (const child of node.children) observer.observe(child);

	// A tab chosen, or tabs added: bring the chosen one into view again.
	const watcher = new MutationObserver(() => reveal(true));
	watcher.observe(node, {
		subtree: true,
		childList: true,
		attributeFilter: ['aria-current', 'aria-selected']
	});

	return {
		destroy() {
			node.removeEventListener('scroll', update);
			observer.disconnect();
			watcher.disconnect();
		}
	};
}
