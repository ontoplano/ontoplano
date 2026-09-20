/**
 * A wait that is not a navigation, said the same way a navigation is.
 *
 * The bar across the top and the turning mark both hang off SvelteKit's
 * `navigating`, which covers a link, a redirect and a form action. It does not
 * cover `invalidateAll()` — the loaders re-run, every word on the screen
 * changes, and for as long as that takes the app says nothing at all. Choosing
 * a language is exactly that: the slowest thing in the app that is not a
 * navigation, and the one with no answer to the press.
 *
 * So this is the other half of the same indicator. A screen with a slow wait
 * declares it, the layout draws what it already draws, and nothing new appears
 * on screen — the point is that a wait looks the same wherever it happens,
 * rather than each screen inventing a spinner of its own.
 *
 * A count rather than a flag, because two waits can overlap and the first one
 * to finish must not put the bar away while the second is still going.
 */

let waits = $state(0);

/** Is the app waiting on something that is not a navigation? */
export function busy(): boolean {
	return waits > 0;
}

/**
 * Show the wait for as long as `work` takes.
 *
 * Gives back exactly what `work` gives back, and lets a rejection through
 * untouched — a caller that wants to handle a failure still can, and one that
 * does not is no worse off than before. The decrement is in `finally` so a
 * throw cannot leave the bar up for the rest of the session.
 */
export async function whileBusy<T>(work: Promise<T>): Promise<T> {
	waits += 1;
	try {
		return await work;
	} finally {
		waits -= 1;
	}
}
