import { SWIPE_MIN_PX, SWIPE_RATIO } from '$lib/slide';

/**
 * A sideways swipe, anywhere on the screen, moves to the next screen along.
 *
 * Clicking a tab was the only way to change tab, which on a phone means
 * reaching for a strip at the top with the thumb that is holding it. Every app
 * with tabs also swipes between them, and it swipes *anywhere* — not over the
 * tabs, and not only over the part of the screen the content happens to fill.
 * So this is attached to the scrolling surface the whole app sits in.
 *
 * Touch only. A mouse has the tabs themselves, and a trackpad's horizontal
 * scroll would fire this constantly.
 *
 * The page's own scroll wins by default, in two ways: the gesture has to be
 * clearly sideways rather than diagonal, and a gesture that begins inside
 * something which really scrolls sideways — a tab strip, a wide table, the
 * habit grid — belongs to that thing while it still has room to move. This
 * never calls `preventDefault`, so a scroll that turns out not to be a swipe
 * is not interrupted; the swipe is decided when the finger lifts.
 *
 * Touch events rather than pointer events, which is the whole reason this
 * worked in a headless browser and not on a phone. A real browser claims a
 * touch the moment it decides the gesture is a scroll, and it tells the page
 * so by firing `pointercancel` — there is no `pointerup` to decide anything
 * on. `touchend` arrives either way, so the finger lifting is still something
 * this can see.
 */
export function onSwipe(
	node: HTMLElement,
	moves: { next: () => void; back: () => void }
): () => void {
	let from: { x: number; y: number } | null = null;
	let inside: HTMLElement | null = null;

	/**
	 * The nearest thing under the finger that scrolls sideways, if any.
	 *
	 * Overflowing is not scrolling, and the difference matters: on a phone
	 * every card pulls itself out past both edges of the column it sits in, so
	 * "wider than its box" describes almost every element on the screen. Only a
	 * box whose own `overflow-x` lets it scroll is one.
	 */
	function sidewaysScrollerAt(target: EventTarget | null): HTMLElement | null {
		let el = target instanceof Element ? target : null;
		while (el && el !== node) {
			if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) {
				const how = getComputedStyle(el).overflowX;
				if (how === 'auto' || how === 'scroll') return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	function down(event: TouchEvent) {
		// One finger. Two is a pinch, and whatever it means it is not this.
		if (event.touches.length !== 1) {
			from = null;
			return;
		}
		const touch = event.touches[0];
		from = { x: touch.clientX, y: touch.clientY };
		inside = sidewaysScrollerAt(event.target);
	}

	function up(event: TouchEvent) {
		if (!from) return;
		const touch = event.changedTouches[0];
		if (!touch) {
			from = null;
			return;
		}
		const dx = touch.clientX - from.x;
		const dy = touch.clientY - from.y;
		from = null;

		if (Math.abs(dx) < SWIPE_MIN_PX) return;
		if (Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

		/*
		 * A scroller under the finger keeps the gesture while it can still go
		 * that way. At its end it hands it over, which is what makes a tab strip
		 * scrolled to its last tab still swipe on to the next section.
		 */
		if (inside) {
			const room =
				dx < 0
					? inside.scrollWidth - inside.clientWidth - inside.scrollLeft > 1
					: inside.scrollLeft > 1;
			if (room) return;
		}

		(dx < 0 ? moves.next : moves.back)();
	}

	function cancel() {
		from = null;
	}

	node.addEventListener('touchstart', down, { passive: true });
	node.addEventListener('touchend', up, { passive: true });
	node.addEventListener('touchcancel', cancel, { passive: true });

	return () => {
		node.removeEventListener('touchstart', down);
		node.removeEventListener('touchend', up);
		node.removeEventListener('touchcancel', cancel);
	};
}
