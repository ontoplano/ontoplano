/**
 * Arriving at `#something` puts that something on screen.
 *
 * The browser does this by itself, for the window. This app does not scroll
 * the window: on a phone the box that scrolls is the layout's `main`, and a
 * link carrying a hash landed at the top of it with the thing it named
 * somewhere below the fold. A notification saying "OD changed 20 things" took
 * you to the integrations page and left you to find the list yourself.
 *
 * `scrollIntoView` walks up to the nearest scrolling ancestor on its own, so
 * the only real work is waiting: the section is usually rendered by a load
 * function that has not answered yet when the navigation completes. So it
 * looks again for a few frames and then gives up rather than scrolling
 * somewhere arbitrary once the page has finally settled.
 */

/** How long to keep looking for the thing the hash names, in milliseconds. */
const WAIT_MS = 1500;

/** How often to look while waiting. One frame is too eager; this is ~4 frames. */
const LOOK_EVERY_MS = 64;

/**
 * Scroll to whatever `hash` names, once it exists.
 *
 * Returns a function that stops looking — for a caller whose page is leaving
 * before the thing ever turned up.
 */
export function scrollToHash(hash: string): () => void {
	const id = hash.replace(/^#/, '');
	if (!id) return () => {};

	let waited = 0;
	const timer = setInterval(() => {
		const target = document.getElementById(id);
		if (target) {
			stop();
			// `start`, not `center`: a section header belongs at the top of the
			// view with its content under it, which is where a reader looks.
			target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}
		waited += LOOK_EVERY_MS;
		if (waited >= WAIT_MS) stop();
	}, LOOK_EVERY_MS);

	function stop() {
		clearInterval(timer);
	}
	return stop;
}
