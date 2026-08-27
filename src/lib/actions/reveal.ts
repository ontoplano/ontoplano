/**
 * Fade a thing in the first time it is scrolled to.
 *
 * A landing page that puts everything on screen at once is a wall, and a
 * visitor reads walls by leaving. Revealing a section as it arrives paces the
 * reading — it is the difference between being handed a page and being told
 * something.
 *
 * Once only: a section that fades every time it re-enters is a section that
 * flickers while you scroll back up to re-read it.
 */
export function reveal(node: HTMLElement, delayMs = 0) {
	// Somebody who has asked for less motion gets the content, immediately.
	const still =
		typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (still || typeof IntersectionObserver === 'undefined') {
		node.classList.add('revealed');
		return {};
	}

	node.classList.add('reveal');
	node.style.transitionDelay = `${delayMs}ms`;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				node.classList.add('revealed');
				observer.disconnect();
			}
		},
		// A little before it arrives, so it is finished by the time it is read.
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
	);

	observer.observe(node);

	return { destroy: () => observer.disconnect() };
}
