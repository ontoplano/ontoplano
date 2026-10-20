/**
 * The mouse events a tap leaves behind, after the tap has already been answered.
 *
 * A finger lifting is `pointerup`, and then — once the touch is over — the
 * browser sends the same tap again as `mousedown`, `mouseup` and `click`, aimed
 * at whatever is under the finger by then. When the `pointerup` opened a sheet,
 * what is under the finger is the sheet: the `mousedown` lands on it and moves
 * focus there, out of the field the sheet had just focused — so the keyboard
 * never came up and the field sat waiting for a second tap.
 *
 * `preventDefault()` on the `pointerup` does not stop them; only the
 * `pointerdown` can, and that one belongs to the scroll. So the leftovers are
 * caught on the way in instead, once, for a moment.
 */

/** How long after the tap its mouse events are still its own. */
export const GHOST_CLICK_MS = 600;

const COMPAT_EVENTS = ['mousedown', 'mouseup', 'click'] as const;

/** Swallow the compatibility mouse events of the tap that has just ended. */
export function swallowGhostClick(ms = GHOST_CLICK_MS): void {
	if (typeof window === 'undefined') return;

	const swallow = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
		// The click is the last of them; nothing after it is the tap's.
		if (event.type === 'click') stop();
	};

	const stop = () => {
		clearTimeout(timer);
		for (const type of COMPAT_EVENTS) window.removeEventListener(type, swallow, true);
	};

	for (const type of COMPAT_EVENTS) window.addEventListener(type, swallow, true);
	const timer = setTimeout(stop, ms);
}
