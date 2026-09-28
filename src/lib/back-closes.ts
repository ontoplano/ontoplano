import { pushState } from '$app/navigation';
import { page } from '$app/state';

/**
 * A screen owns a history entry.
 *
 * On a phone a modal is drawn as a full screen, and a screen that the system
 * back gesture cannot leave is what makes a web page feel like a web page:
 * pressing Android's back button walked out of the app instead of closing the
 * form on top of it. So while such a screen is open it holds a shallow history
 * entry — SvelteKit's `pushState`, same URL — and going back pops the entry and
 * closes the screen instead of navigating.
 *
 * Screens stack: the delete confirmation opens over the Edit notebook form, a
 * picture opens over a maximized notebook. Each entry therefore carries the
 * whole stack of marks open at that point, the newest last, and a screen is
 * open for as long as its mark is in the stack of the entry the browser is on.
 * Back from `[edit, confirm]` lands on `[edit]`: the confirmation closes and
 * the form stays. With one mark per entry instead, opening the confirmation
 * replaced the form's mark, and the form read that as a back press and closed.
 *
 * Three duties, one owner each:
 *
 *   - `claim()` when the screen opens: push an entry with its mark on top.
 *   - `watch()` from an `$effect`: when the mark has gone from the entry, the
 *     back gesture fired — close the screen. Reading `page.state` is what
 *     subscribes the effect.
 *   - `release()` when the screen closes by its own controls — the back
 *     arrow, Escape, a saved form: take its entry back out with
 *     `history.back()`, so the next real back press leaves the page, not a
 *     ghost of the screen. It answers with a promise that settles once every
 *     pop under way has landed, for a caller that has to navigate afterwards.
 *
 * A screen released while another is still open above it cannot take its
 * entry out without taking the other's too. Its mark is remembered as
 * released instead, and whichever pop next uncovers it carries on past it.
 *
 * Pushes and pops go through one queue, in order: `history.back()` lands a
 * frame or two later, and a push made in between would be the entry it pops.
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

/**
 * How long a pop may take to land before it is given up on.
 *
 * A `popstate` normally follows `history.back()` within a frame or two; one
 * that never comes (nothing behind the entry) must not hold the queue forever.
 */
const POP_TIMEOUT_MS = 1000;

/** The stack of marks on the entry the browser is actually sitting on. */
function stackInHistory(): number[] {
	const states = (history.state ?? {})[HISTORY_STATE] as App.PageState | undefined;
	const held = states?.backCloses;
	return Array.isArray(held) ? held : [];
}

/** Marks whose screens closed while something above still held its entry. */
const released = new Set<number>();

let queue: Promise<void> = Promise.resolve();

function enqueue(step: () => void | Promise<void>): Promise<void> {
	const run = queue.then(step);
	queue = run.catch(() => undefined);
	return run;
}

/** Settles once nothing is left in the queue, including steps added meanwhile. */
function idle(): Promise<void> {
	const current = queue;
	return current.then(() => (current === queue ? undefined : idle()));
}

/*
 * Whether the page is being left.
 *
 * A pop waits its turn in the queue, and by then somebody may already have
 * pressed a link or typed an address: a `history.back()` fired into a
 * navigation that has started cancels it, and the press goes nowhere. Once the
 * page is on its way out there is no entry worth taking back.
 */
let leaving = false;
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', () => (leaving = true));
	window.addEventListener('pageshow', () => (leaving = false));
}

function pop(from: string): Promise<void> {
	// Gone, or already somewhere else: the entry went with the page it was on.
	if (leaving || location.href !== from) return Promise.resolve();
	return new Promise((landed) => {
		const done = () => {
			clearTimeout(timer);
			window.removeEventListener('popstate', done);
			landed();
		};
		const timer = setTimeout(done, POP_TIMEOUT_MS);
		window.addEventListener('popstate', done);
		history.back();
	});
}

/** Pop every entry on top whose screen has already closed, while still on `from`. */
async function drain(from: string): Promise<void> {
	for (;;) {
		const top = stackInHistory().at(-1);
		if (top === undefined || !released.has(top)) return;
		if (leaving || location.href !== from) return;
		await pop(from);
		released.delete(top);
		// A pop that went nowhere would loop here for ever.
		if (stackInHistory().at(-1) === top) return;
	}
}

let nextMark = 0;

export class BackCloses {
	#mark: number | null = null;
	/** Whether the entry is actually in the history yet: the push is queued. */
	#held = false;
	#onback: () => void;

	constructor(onback: () => void) {
		this.#onback = onback;
	}

	claim(): void {
		if (this.#mark !== null) return;
		const mark = ++nextMark;
		this.#mark = mark;
		void enqueue(() => {
			// Closed again before its turn came: nothing to push.
			if (this.#mark !== mark) return;
			pushState('', { ...page.state, backCloses: [...stackInHistory(), mark] });
			this.#held = true;
		});
	}

	watch(): void {
		// Read the state before anything can return: the caller is an
		// `$effect`, and an effect only re-runs on what it actually read.
		// Behind an early return, the first run — mark still null — would
		// subscribe to nothing and the effect would never fire again.
		const current = page.state.backCloses;
		if (this.#mark === null || !this.#held) return;
		if (Array.isArray(current) && current.includes(this.#mark)) return;
		/*
		 * Gone from `page.state` is not gone.
		 *
		 * `invalidateAll()` resets that state and moves no history at all. The
		 * list of notifications marks itself read as it opens, which reloads the
		 * shell — and that read exactly like a back press, so on a phone the list
		 * closed itself in the frame it appeared in, every time there was
		 * something unread in it to open it for.
		 */
		if (stackInHistory().includes(this.#mark)) return;
		this.#mark = null;
		this.#held = false;
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
		const mark = this.#mark;
		this.#mark = null;
		this.#held = false;
		if (mark !== null) released.add(mark);
		const from = location.href;
		return enqueue(() => drain(from)).then(idle);
	}
}
