/**
 * A textarea the size of what is in it.
 *
 * `rows` is a guess made when the markup was written, so opening an editor on
 * four paragraphs showed two lines and a scrollbar and the first thing anybody
 * did was drag the corner. This measures instead: the box is as tall as its
 * content, from the moment it appears and after every keystroke, up to a
 * ceiling so one long note cannot push the buttons off the screen.
 *
 * The `rows` attribute still sets the minimum, so an empty composer stays the
 * modest two lines it was written as.
 */
export const DEFAULT_AUTOGROW_MAX_HEIGHT = 480;

export function autogrow(node: HTMLTextAreaElement, maxHeight = DEFAULT_AUTOGROW_MAX_HEIGHT) {
	/**
	 * Everything between this box and the top of the page that can scroll.
	 *
	 * Collapsing the box to measure it shortens whatever holds it, and a
	 * scroller that is suddenly taller than its content has its `scrollTop`
	 * clamped by the browser — a number it does not give back when the box
	 * grows again. On a long note that happened on every keystroke, and each
	 * one walked the line being typed a little further down until it was
	 * sitting on the bottom edge of the screen.
	 */
	const scrollers = () => {
		const found: { el: Element | Window; top: number }[] = [{ el: window, top: window.scrollY }];
		for (let p = node.parentElement; p; p = p.parentElement) {
			const how = getComputedStyle(p).overflowY;
			if (how === 'auto' || how === 'scroll') found.push({ el: p, top: p.scrollTop });
		}
		return found;
	};

	const restore = (kept: { el: Element | Window; top: number }[]) => {
		for (const { el, top } of kept) {
			if (el === window) window.scrollTo({ top });
			else (el as Element).scrollTop = top;
		}
	};

	const resize = () => {
		const content = node.scrollHeight;
		const current = node.clientHeight;

		/*
		 * Growing needs no measurement trick: `scrollHeight` is the height of
		 * what is in the box whether or not the box is that tall, so typing
		 * forward — which is the whole of the common case — never collapses
		 * anything and never disturbs a scroller.
		 */
		if (content > current) {
			node.style.height = `${Math.min(content, maxHeight)}px`;
			node.style.overflowY = content > maxHeight ? 'auto' : 'hidden';
			return;
		}

		/*
		 * Nothing to do when the box already fits what is in it.
		 *
		 * `content > current` is false both when the text shrank *and* when it
		 * did not change height at all — which is almost every keystroke. The
		 * collapse below was therefore running on each one, and a box that is
		 * full and scrolled loses its own `scrollTop` to `height: auto` for a
		 * frame: the line being typed jumps away and comes back, which is the
		 * "characters FLICK and disappear" nobody could catch in a
		 * screenshot. Measuring only when the content actually got shorter
		 * leaves ordinary typing alone.
		 */
		if (content === current) return;

		// Shrinking is the one case that has to ask, because a box taller than
		// its content reports its own height. Put the scrollers back
		// afterwards — this box's own included, which `height: auto` clamps
		// exactly like it clamps an ancestor's.
		const kept = scrollers();
		const mine = node.scrollTop;
		node.style.height = 'auto';
		const wanted = Math.min(node.scrollHeight, maxHeight);
		node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
		node.style.height = `${wanted}px`;
		node.scrollTop = mine;
		restore(kept);
	};

	resize();
	node.addEventListener('input', resize);

	return {
		update(next: number) {
			maxHeight = next;
			resize();
		},
		destroy() {
			node.removeEventListener('input', resize);
		}
	};
}
