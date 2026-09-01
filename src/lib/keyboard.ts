/**
 * How much of the screen is left when the software keyboard is up.
 *
 * A sheet on a phone is `height: 100dvh`, and `dvh` does not shrink when the
 * keyboard opens — it is the *layout* viewport, and the keyboard covers the
 * layout viewport rather than resizing it. So a form's Save button, pinned to
 * the bottom of a full-height sheet, ends up underneath the keyboard: you type
 * the thing and then have to dismiss the keyboard to confirm it, which is a
 * step nobody should have to discover.
 *
 * What does know is `window.visualViewport` — the part actually on screen. This
 * is the arithmetic, out of the component so it can be checked: getting it
 * wrong in the other direction (reacting to the URL bar collapsing, say) makes
 * the sheet jump while somebody is reading it.
 */

export type Viewport = {
	/** The layout viewport — what `100dvh` resolves to. */
	innerHeight: number;
	/** The part actually visible, which the keyboard shrinks. */
	viewportHeight: number;
	/** How far the visible part has been pushed down, if at all. */
	offsetTop: number;
};

/**
 * Below this, it is not a keyboard.
 *
 * A collapsing URL bar moves the visual viewport by 50-90px on most phones, and
 * treating that as a keyboard would resize the sheet every time somebody
 * scrolls. A keyboard is never this short.
 */
export const KEYBOARD_THRESHOLD = 120;

/**
 * The height a sheet should take, or null to leave it at `100dvh`.
 *
 * Null rather than a number for the ordinary case, so nothing is written into
 * the style attribute at all until there is a reason — a sheet whose height is
 * pinned in pixels no longer follows a rotation or a resize.
 */
export function panelHeight(view: Viewport): number | null {
	const covered = view.innerHeight - view.viewportHeight - view.offsetTop;
	if (!Number.isFinite(covered) || covered < KEYBOARD_THRESHOLD) return null;
	// Never taller than the layout viewport, and never absurdly short: a bad
	// reading is better ignored than obeyed.
	if (view.viewportHeight < 160) return null;
	return Math.round(view.viewportHeight);
}

/** What the browser is reporting right now, or null where it cannot say. */
export function readViewport(): Viewport | null {
	if (typeof window === 'undefined' || !window.visualViewport) return null;
	return {
		innerHeight: window.innerHeight,
		viewportHeight: window.visualViewport.height,
		offsetTop: window.visualViewport.offsetTop
	};
}
