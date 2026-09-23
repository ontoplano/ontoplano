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
	/*
	 * What was last reported, so the same answer is not sent twice.
	 *
	 * Kept across `update`: a caller writing `use:overflows={(over) => …}`
	 * hands over a new closure on every render, and re-measuring on each one
	 * meant reporting, which re-rendered, which handed over another closure.
	 * The callback is swapped; the answer is not re-asked.
	 */
	let told: boolean | null = null;
	let answer = tell;

	/*
	 * How tall the text would be with nothing cut off.
	 *
	 * `scrollHeight` cannot answer this for the clamp the app actually uses: a
	 * `-webkit-box` with `line-clamp` reports the clamped height as both its
	 * client and its scroll height, so a paragraph cut to one line looks
	 * exactly like a paragraph that is one line. The clamp is lifted for the
	 * length of one measurement and put straight back, with no chance to paint
	 * in between — the read is synchronous.
	 *
	 * `''` rather than the old value, because the clamp is a class rather than
	 * an inline style: emptying the property is what hands it back.
	 */
	const naturalHeight = () => {
		el.style.webkitLineClamp = 'unset';
		const tall = el.scrollHeight;
		el.style.webkitLineClamp = '';
		return tall;
	};

	const measure = () => {
		// A pixel of slack: sub-pixel line heights make an unclamped element
		// report a height a fraction taller than its box, forever.
		const over = naturalHeight() - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1;
		if (over === told) return;
		told = over;
		answer(over);
	};

	const sized = new ResizeObserver(measure);
	sized.observe(el);

	const changed = new MutationObserver(measure);
	changed.observe(el, { subtree: true, childList: true, characterData: true });

	// After the first layout, so the text has its real width.
	const frame = requestAnimationFrame(measure);

	return {
		update(next: Overflows) {
			answer = next;
		},
		destroy() {
			cancelAnimationFrame(frame);
			sized.disconnect();
			changed.disconnect();
		}
	};
}
