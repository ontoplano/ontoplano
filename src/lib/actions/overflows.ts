/**
 * Whether an element is showing less than it holds, answered as it changes.
 *
 * A control that unfolds something is only worth drawing when there is
 * something folded: a task whose notes are one short line was carrying a
 * chevron, and pressing it swapped one line of text for the same line of text.
 * The same non-offer `FoldedText` avoids for a notebook's description, which
 * measures for exactly this reason.
 *
 * It has to be measured rather than counted. Whether a line is clamped depends
 * on the width of the page, the size of the type and where the words happen to
 * break, and a character count is wrong on all three at every breakpoint.
 *
 * Watches the element and its contents: a picture that loads late, a
 * translation that is longer, a window somebody dragged narrower — all of them
 * change the answer, and none of them is a render of the component that asked.
 */
export type Overflows = (yes: boolean) => void;

export function overflows(el: HTMLElement, tell: Overflows) {
	let told: boolean | null = null;

	const measure = () => {
		// A pixel of slack: sub-pixel line heights make an unclamped element
		// report a scrollHeight a fraction taller than its box, forever.
		const over = el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1;
		if (over === told) return;
		told = over;
		tell(over);
	};

	const sized = new ResizeObserver(measure);
	sized.observe(el);

	const changed = new MutationObserver(measure);
	changed.observe(el, { subtree: true, childList: true, characterData: true });

	// After the first layout, so the text has its real width.
	const frame = requestAnimationFrame(measure);

	return {
		update(next: Overflows) {
			tell = next;
			told = null;
			measure();
		},
		destroy() {
			cancelAnimationFrame(frame);
			sized.disconnect();
			changed.disconnect();
		}
	};
}
