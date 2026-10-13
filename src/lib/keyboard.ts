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
	/**
	 * The tallest the layout viewport has been at this width since the sheet
	 * opened — see `openedHeight`. Left out, only the two above are compared.
	 */
	openedHeight?: number;
};

/** The layout viewport's size, as `openedHeight` remembers it. */
export type Layout = { width: number; height: number };

/**
 * What the layout viewport measured before anything covered it.
 *
 * Comparing the visible part with the layout viewport only sees a keyboard
 * that *covers* the page. Where the keyboard *resizes* it — Chrome honouring
 * `interactive-widget=resizes-content`, and the Android app, which shrinks its
 * web view for the keyboard — both shrink together, the difference is zero,
 * and a short sheet stayed half of what was left: a header and one field. So
 * the height before the keyboard is kept and compared too. A change of width is
 * a rotation, not a keyboard, and starts the measure again.
 */
export function openedHeight(before: Layout | null, now: Layout): Layout {
	if (!before || before.width !== now.width) return now;
	return now.height > before.height ? now : before;
}

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
	const layout = Math.max(view.innerHeight, view.openedHeight ?? 0);
	const covered = layout - view.viewportHeight - view.offsetTop;
	if (!Number.isFinite(covered) || covered < KEYBOARD_THRESHOLD) return null;
	// Never taller than the layout viewport, and never absurdly short: a bad
	// reading is better ignored than obeyed.
	if (view.viewportHeight < 160) return null;
	return Math.round(view.viewportHeight);
}

/**
 * How far down the sheet starts while the keyboard is up, in layout pixels.
 *
 * Android's app web view is not resized for the keyboard: it pans the visible
 * area down to keep the focused field in sight, and reports that as the visual
 * viewport's `offsetTop`. A dialog fixed at the layout's top then ends that far
 * above the keyboard, floating over the page behind with a gap underneath. It
 * starts where the visible part starts instead. Zero whenever `panelHeight`
 * leaves the sheet alone, so the two always agree.
 */
export function panelTop(view: Viewport): number {
	if (panelHeight(view) === null) return 0;
	return Math.max(0, Math.round(view.offsetTop));
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

/*
 * When nothing reports the keyboard at all.
 *
 * Everything above depends on the page being told. The Android app on 15 and
 * later is not, until its web view is rebuilt to shrink for the keyboard
 * (MainActivity): the keys are laid over the page and every reading stays
 * what it was. The new-block sheet opens short with its name field focused,
 * the keyboard comes up over the whole of it, and nothing can be scrolled
 * until the keyboard is dismissed — which is the one moment the sheet works.
 *
 * So until a keyboard has been seen being reported, a focused text field on a
 * touch phone is taken to have one over the bottom of the screen: the sheet
 * takes the whole height and leaves room below its last field to scroll
 * above it. The first real report switches this off for the rest of the page.
 */

/** How much of the screen a keyboard nobody reports is assumed to cover. */
export const ASSUMED_KEYBOARD_SHARE = 0.5;

/** Space kept between a field and the top of an assumed keyboard, in pixels. */
export const ASSUMED_KEYBOARD_GAP = 16;

/** Input types that open a picker or nothing, rather than the keyboard. */
const NO_KEYBOARD_TYPES = new Set([
	'button',
	'checkbox',
	'color',
	'date',
	'datetime-local',
	'file',
	'hidden',
	'image',
	'month',
	'radio',
	'range',
	'reset',
	'submit',
	'time',
	'week'
]);

/** The parts of an element that say whether focusing it brings up the keyboard. */
export type Focused = { tagName: string; type?: string; isContentEditable?: boolean };

/** Whether focusing this brings up the software keyboard. */
export function opensKeyboard(el: Focused | null | undefined): boolean {
	if (!el) return false;
	if (el.isContentEditable) return true;
	const tag = el.tagName.toUpperCase();
	if (tag === 'TEXTAREA') return true;
	if (tag !== 'INPUT') return false;
	return !NO_KEYBOARD_TYPES.has((el.type ?? 'text').toLowerCase());
}

let reported = false;

/** Note a reading: once a keyboard has been reported, nothing is assumed again. */
export function noteKeyboard(height: number | null): void {
	if (height !== null) reported = true;
}

/** Whether this page has ever been told of a keyboard. */
export function keyboardReported(): boolean {
	return reported;
}

/**
 * How far to scroll so a field ends above an assumed keyboard, or 0.
 *
 * `bottom` is the field's bottom edge and `screen` the window's height, both
 * in the same pixels. Only ever down the form: a field already clear of the
 * keyboard stays exactly where the finger left it.
 */
export function assumedScroll(bottom: number, screen: number): number {
	const keyboardTop = screen * (1 - ASSUMED_KEYBOARD_SHARE) - ASSUMED_KEYBOARD_GAP;
	return Math.max(0, Math.round(bottom - keyboardTop));
}
