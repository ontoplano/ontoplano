import type { Action } from 'svelte/action';
import { untrack } from 'svelte';

/**
 * A long list, drawn a page at a time as somebody scrolls towards its end.
 *
 * Every task an account has ever finished comes with the page — the filters,
 * the search and the order are all worked out in the browser, which is what
 * makes them instant — but drawing seven hundred rows at once froze the screen
 * for seconds the moment "Completed" was pressed. So the rows are drawn fifty
 * at a time, and the next fifty when the tenth from the end comes near the
 * screen: before the end is reached, not at it.
 *
 * A list opts in with a `Reveal` and `use:revealNear` on its rows. Counts,
 * filters and select-all still work on the whole list; only the drawing waits.
 */

/** How many rows are drawn at first, and how many more each time. */
export const REVEAL_PAGE = 50;
/** How many rows from the drawn end the next page is asked for. */
export const REVEAL_AHEAD_ROWS = 10;
/** How far off the screen that row may still be, so the next page is ready on arrival. */
export const REVEAL_MARGIN_PX = 400;

export class Reveal {
	/** How many rows are drawn. */
	count = $state(REVEAL_PAGE);
	#total: () => number;
	#last: number | null = null;

	/**
	 * `total` is how long the list on screen is now; `source`, how many things
	 * there are before any filter — so a row added is told apart from a filter
	 * that lets more through, which must not draw them all.
	 */
	constructor(total: () => number, source: () => number = total) {
		this.#total = total;
		// Something added is drawn as well, rather than pushing the last row
		// off the end: fifty shown and one added is fifty-one.
		$effect.pre(() => {
			const now = source();
			untrack(() => {
				if (this.#last !== null && now > this.#last) this.count += now - this.#last;
				this.#last = now;
			});
		});
	}

	/** The rows to draw. */
	of<T>(items: readonly T[]): readonly T[] {
		return items.length <= this.count ? items : items.slice(0, this.count);
	}

	/** The row whose approach draws the next page, or -1 when everything is drawn. */
	get trigger(): number {
		return this.#total() > this.count ? Math.max(0, this.count - REVEAL_AHEAD_ROWS) : -1;
	}

	more(): void {
		this.count += REVEAL_PAGE;
	}

	/** Draw at least up to this row — for a key that walks past the drawn end. */
	reach(index: number): void {
		while (index >= this.count - 1 && this.count < this.#total()) this.count += REVEAL_PAGE;
	}
}

/**
 * On every row of a revealed list: the row at the trigger asks for the next
 * page as it nears the screen. The others carry the action and do nothing.
 *
 * `trigger` is passed rather than read, so the row is told when it moves —
 * `use:revealNear={{ reveal, index: i, trigger: reveal.trigger }}`.
 */
export const revealNear: Action<HTMLElement, { reveal: Reveal; index: number; trigger: number }> = (
	node,
	initial
) => {
	let observer: IntersectionObserver | null = null;
	let current = initial;

	function watch() {
		const wanted = current.index === current.trigger;
		if (wanted && !observer) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) current.reveal.more();
				},
				{ rootMargin: `${REVEAL_MARGIN_PX}px 0px` }
			);
			observer.observe(node);
		} else if (!wanted && observer) {
			observer.disconnect();
			observer = null;
		}
	}
	watch();

	return {
		update(next) {
			current = next;
			watch();
		},
		destroy() {
			observer?.disconnect();
		}
	};
};
