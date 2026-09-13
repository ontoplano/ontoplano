import { TAB_SWIPE_MIN_PX, TAB_SWIPE_RATIO } from '$lib/tab-slide';

/**
 * A sideways swipe moves to the tab beside this one.
 *
 * Clicking a tab was the only way to change tab, which on a phone means
 * reaching for a strip at the top of the screen with the thumb that is holding
 * it. Every app with tabs also lets you swipe between them, and the row of
 * tabs is exactly the mental model a swipe fits.
 *
 * Touch only. A mouse has the tabs themselves and a trackpad's horizontal
 * scroll would fire this constantly.
 *
 * The page's own scroll wins by default, in two ways: the gesture has to be
 * clearly sideways rather than diagonal, and a gesture that begins inside
 * something which scrolls sideways — a tab strip, a wide table, the habit grid
 * — belongs to that thing while it still has room to move. This never calls
 * `preventDefault`, so a scroll that turns out not to be a swipe is not
 * interrupted; the swipe is decided when the finger lifts.
 */
export function swipeTabs(node: HTMLElement, moves: { next: () => void; back: () => void }) {
	let handlers = moves;
	let from: { x: number; y: number } | null = null;
	let inside: HTMLElement | null = null;

	/**
	 * The nearest thing under the finger that scrolls sideways, if any.
	 *
	 * Overflowing is not scrolling, and the difference matters here: on a phone
	 * every card pulls itself out past both edges of the column it sits in, so
	 * "wider than its box" describes almost every element on the screen. Only a
	 * box whose own `overflow-x` lets it scroll is one — a tab strip, a wide
	 * table, the habit grid.
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

	function down(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		from = { x: event.clientX, y: event.clientY };
		inside = sidewaysScrollerAt(event.target);
	}

	function up(event: PointerEvent) {
		if (!from || event.pointerType !== 'touch') return;
		const dx = event.clientX - from.x;
		const dy = event.clientY - from.y;
		const started = from;
		from = null;

		if (Math.abs(dx) < TAB_SWIPE_MIN_PX) return;
		if (Math.abs(dx) < Math.abs(dy) * TAB_SWIPE_RATIO) return;

		/*
		 * A scroller under the finger keeps the gesture while it can still go
		 * that way. At its end it hands it over, which is what makes a tab strip
		 * scrolled to its last tab still swipe to the next room section.
		 */
		if (inside) {
			const room =
				dx < 0
					? inside.scrollWidth - inside.clientWidth - inside.scrollLeft > 1
					: inside.scrollLeft > 1;
			if (room) return;
		}

		void started;
		(dx < 0 ? handlers.next : handlers.back)();
	}

	function cancel() {
		from = null;
	}

	node.addEventListener('pointerdown', down, { passive: true });
	node.addEventListener('pointerup', up, { passive: true });
	node.addEventListener('pointercancel', cancel, { passive: true });

	return {
		update(next: { next: () => void; back: () => void }) {
			handlers = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		}
	};
}
