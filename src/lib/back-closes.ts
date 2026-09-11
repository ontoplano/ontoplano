import { pushState } from '$app/navigation';
import { page } from '$app/state';

/**
 * A screen owns a history entry.
 *
 * On a phone a modal is drawn as a full screen, and a screen that the system
 * back gesture cannot leave is what makes a web page feel like a web page:
 * pressing Android's back button walked out of the app instead of closing the
 * form on top of it. So while such a screen is open it holds one shallow
 * history entry — SvelteKit's `pushState`, same URL — and going back pops the
 * entry and closes the screen instead of navigating.
 *
 * Three duties, one owner each:
 *
 *   - `claim()` when the screen opens: push the entry, marked as ours.
 *   - `watch()` from an `$effect`: when the mark has gone from `page.state`,
 *     the back gesture fired — close the screen. Reading `page.state` is what
 *     subscribes the effect.
 *   - `release()` when the screen closes by its own controls — the back
 *     arrow, Escape, a saved form: take the entry back out with
 *     `history.back()`, so the next real back press leaves the page, not a
 *     ghost of the screen.
 *
 * Each mark is unique, so two screens in one session can never mistake the
 * other's entry for their own.
 */

let nextMark = 0;

export class BackCloses {
	#mark: number | null = null;
	#onback: () => void;

	constructor(onback: () => void) {
		this.#onback = onback;
	}

	claim(): void {
		if (this.#mark !== null) return;
		this.#mark = ++nextMark;
		pushState('', { ...page.state, backCloses: this.#mark });
	}

	watch(): void {
		// Read the state before anything can return: the caller is an
		// `$effect`, and an effect only re-runs on what it actually read.
		// Behind an early return, the first run — mark still null — would
		// subscribe to nothing and the effect would never fire again.
		const current = page.state.backCloses;
		if (this.#mark === null) return;
		if (current !== this.#mark) {
			this.#mark = null;
			this.#onback();
		}
	}

	release(): void {
		if (this.#mark === null) return;
		const ours = page.state.backCloses === this.#mark;
		this.#mark = null;
		if (ours) history.back();
	}
}
