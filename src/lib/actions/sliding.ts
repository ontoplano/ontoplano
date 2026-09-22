/**
 * The tile on a segmented control slides to the position you pressed.
 *
 * `.seg` was already the right shape — an outer track with the choices inside
 * it — and the one you were on was drawn by swapping a background onto that
 * button. Which reads as two buttons where one happens to be filled, rather
 * than as one control with a position: nothing connects the place it was to the
 * place it is now, so the eye has to find the filled one again after every
 * press.
 *
 * So the tile is a single element that moves. It is measured from whichever
 * child says `aria-pressed="true"` — the convention every `.seg` in this app
 * already uses — and the buttons themselves go transparent, which is why this
 * is an action rather than a component: ten of these exist, written out by
 * hand with different children, and none of them has to change.
 *
 * Drawn behind the labels, so it never touches what anybody is reading.
 *
 * Nothing moves where somebody has asked for that: with `prefers-reduced-motion`
 * the tile still goes to the right place, it simply arrives there at once.
 */
const SELECTED = '[aria-pressed="true"], [aria-selected="true"]';

export function sliding(track: HTMLElement) {
	const tile = document.createElement('span');
	tile.className = 'seg-tile';
	tile.setAttribute('aria-hidden', 'true');
	track.prepend(tile);
	track.classList.add('seg-sliding');

	/** Where the pressed one is, in the track's own coordinates. */
	const place = () => {
		const chosen = track.querySelector<HTMLElement>(SELECTED);
		if (!chosen) {
			tile.style.opacity = '0';
			return;
		}
		// `offsetLeft` rather than a rect difference: the track scrolls in some
		// of these, and an offset is already relative to it.
		tile.style.opacity = '1';
		tile.style.width = `${chosen.offsetWidth}px`;
		tile.style.height = `${chosen.offsetHeight}px`;
		tile.style.transform = `translate(${chosen.offsetLeft}px, ${chosen.offsetTop}px)`;
	};

	/*
	 * Placed again whenever the answer could have changed.
	 *
	 * The attribute moves when somebody presses, and the geometry moves when
	 * the control is resized or its labels change — a segmented control that
	 * wraps to two lines on a phone is the case that catches a one-off measure.
	 */
	const watching = new MutationObserver(place);
	watching.observe(track, {
		subtree: true,
		attributes: true,
		attributeFilter: ['aria-pressed', 'aria-selected'],
		childList: true
	});

	const sized = new ResizeObserver(place);
	sized.observe(track);

	// After the first layout, so the labels have their real widths.
	requestAnimationFrame(place);

	return {
		destroy() {
			watching.disconnect();
			sized.disconnect();
			tile.remove();
			track.classList.remove('seg-sliding');
		}
	};
}
