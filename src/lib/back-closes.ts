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
 *   - `watch()` from an `$effect`: when the mark has gone from the history
 *     entry, the back gesture fired — close the screen. Reading `page.state`
 *     is what subscribes the effect.
 *   - `release()` when the screen closes by its own controls — the back
 *     arrow, Escape, a saved form: take the entry back out with
 *     `history.back()`, so the next real back press leaves the page, not a
 *     ghost of the screen. It answers with a promise that settles once the
 *     pop has landed, for a caller that has to navigate afterwards.
 *
 * Each mark is unique, so two screens in one session can never mistake the
 * other's entry for their own.
 */

/**
 * Where SvelteKit keeps a history entry's shallow state.
 *
 * `page.state` is its copy of that, and the copy is thrown away by things that
 * are not a way back: every `invalidate` resets it to nothing, which is how
 * any screen reloads the shell's data. So the entry itself is what gets asked
 * whether the mark is still there — the browser's history is the authority for
 * a question about the browser's history.
 */
const HISTORY_STATE = 'sveltekit:states';

/** The mark on the entry the browser is actually sitting on, if any. */
function markInHistory(): number | undefined {
	const states = (history.state ?? {})[HISTORY_STATE] as App.PageState | undefined;
	return states?.backCloses;
}

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
		if (current === this.#mark) return;
		/*
		 * Gone from `page.state` is not gone.
		 *
		 * `invalidateAll()` resets that state and moves no history at all. The
		 * list of notifications marks itself read as it opens, which reloads the
		 * shell — and that read exactly like a back press, so on a phone the list
		 * closed itself in the frame it appeared in, every time there was
		 * something unread in it to open it for.
		 */
		if (markInHistory() === this.#mark) return;
		this.#mark = null;
		this.#onback();
	}

	/**
	 * Take the entry back out, and say when it is actually out.
	 *
	 * `history.back()` is asynchronous: the pop lands a frame or two later, as
	 * a `popstate`. Anything that navigates in the same breath as closing the
	 * screen is therefore undone by it — the reminders window chosen in the
	 * phone's dialog replaced the entry this is about to pop, so the choice
	 * went nowhere and the page looked as if the button did nothing. Awaiting
	 * this is how such a caller navigates *after* the way back is given up.
	 */
	release(): Promise<void> {
		if (this.#mark === null) return Promise.resolve();
		const ours = markInHistory() === this.#mark;
		this.#mark = null;
		if (!ours) return Promise.resolve();
		return new Promise((settled) => {
			const done = () => {
				window.removeEventListener('popstate', done);
				settled();
			};
			window.addEventListener('popstate', done, { once: true });
			history.back();
		});
	}
}
