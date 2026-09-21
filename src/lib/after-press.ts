/**
 * Do it once the press has finished being delivered.
 *
 * Changing what is under the pointer *during* a press — removing the element
 * that was pressed, or opening something over it — makes the browser finish
 * that press against whatever has moved into the spot. What arrives is a
 * second, trusted click with `detail: 0` on a different element, so a chip's
 * × took the next chip off with it, and a card's Edit opened the editor and
 * then let the press through to the card underneath.
 *
 * A timeout of zero is a whole task later: after every listener for this
 * press, and before anything is painted. Nothing is perceptibly slower and
 * the element the browser is still delivering to is where it was.
 *
 * Not a microtask, which was tried: microtasks run *between* two listeners for
 * the same event, so the DOM had already changed by the time the second one
 * arrived. `stopPropagation` does not help either, for the same reason — the
 * second delivery is a separate invocation rather than more propagation.
 */
export function afterPress(run: () => void): void {
	setTimeout(run, 0);
}
