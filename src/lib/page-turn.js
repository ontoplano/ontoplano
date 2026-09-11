/**
 * How changing screen looks, in one place.
 *
 * The page turn is spread across three worlds that cannot see each other — a
 * Node script that draws the masks, a stylesheet that names them, and the
 * navigation hook that starts the whole thing — and every one of them needs
 * the same numbers. So none of them holds one: they all read this, the script
 * writes `src/routes/page-turn.css` from it, and `yarn eink:check` fails the
 * lint if that file and these values have drifted apart.
 *
 * `.js` rather than `.ts` on purpose. The generator runs under plain Node and
 * the app runs through Vite, and this is the only shape both can import
 * without a build step standing between them.
 *
 * To make the turn faster or slower, change `durationMs` and reload — it is
 * stamped onto the document at startup, so nothing has to be regenerated.
 * Changing anything else means running `yarn eink`, which redraws the masks.
 */
export const PAGE_TURN = {
	/**
	 * How long the dissolve takes, end to end.
	 *
	 * The knob worth touching. Long enough to read as ink flipping, short
	 * enough that somebody moving quickly through the app never waits on it.
	 */
	durationMs: 480,

	/**
	 * How many thresholds the dissolve passes through.
	 *
	 * Eight is chunky and meant to be: an e-reader snaps through a few coarse
	 * states rather than fading. More steps costs more images and looks
	 * smoother, which is the opposite of the point.
	 */
	steps: 8,

	/** The stamp that tiles across the screen, in CSS pixels. */
	tilePx: 128,

	/**
	 * How big one flipping dot is.
	 *
	 * A single device pixel reads as film grain rather than as ink. Two CSS
	 * pixels is about the size of the dots a real e-reader flips.
	 */
	dotPx: 2,

	/** Where the generated masks are served from. */
	dir: '/eink',

	/**
	 * The longest the app may be held still waiting for a navigation to settle.
	 *
	 * The transition waits so the browser photographs the new screen rather
	 * than the old one, but a navigation that redirects can leave that promise
	 * unsettled for ever — and a frozen app is not a price worth paying for a
	 * decoration. See the hook in `+layout.svelte`.
	 */
	holdMs: 1000,

	/** Fixed, so the committed masks are a function of these values alone. */
	seed: 0x01070a
};
