/**
 * How changing screen looks: the numbers, and what each of them means.
 *
 * The dissolve is an SVG turbulence filter thresholded hard enough that every
 * pixel snaps fully on or fully off, with the threshold slid across the screen
 * over the length of the turn. Both halves read one noise field, so a dot
 * leaving the old screen is the dot arriving on the new one — which is what
 * makes it read as ink flipping rather than two pictures fading past
 * each other.
 *
 * It is driven from script rather than from CSS because no CSS animation can
 * reach inside a filter to move `intercept` — that loop is in
 * `page-turn.svelte.ts`, along with the values in force right now, which a
 * tuner can move while the app runs. That is also the cost: turbulence is
 * computed over the viewport every frame, on the CPU. It is affordable at
 * this duration and would not be at five times it.
 *
 * This file holds no runes, because it is read by things that are not Svelte.
 */
export const PAGE_TURN_DEFAULTS = {
	/**
	 * How long the dissolve takes, end to end.
	 *
	 * The knob worth touching. /dev/page-turn turns it live; this is what
	 * everybody gets who has not.
	 */
	durationMs: 240,

	/**
	 * How fine the dots are — `feTurbulence`'s base frequency.
	 *
	 * Higher is finer. Much above 1 and it reads as film grain rather than as
	 * ink; much below 0.4 and the blotches are big enough to look like a wipe.
	 */
	grain: 0.85,

	/**
	 * How hard the threshold snaps, as the slope of the alpha ramp.
	 *
	 * Low numbers leave a band of half-lit dots, which is a soft fade wearing
	 * texture. High numbers are the e-reader: on or off, nothing between.
	 */
	hardness: 30,

	/** One field for both halves. Fixed, so the two stay complementary. */
	seed: 7,

	/**
	 * The longest the app may be held still waiting for a navigation to settle.
	 *
	 * The turn waits so the browser photographs the new screen rather than the
	 * old one, but a navigation that redirects can leave that promise unsettled
	 * for ever — and a frozen app is not a price worth paying for a decoration.
	 */
	holdMs: 1000,

	/** The filters in `+layout.svelte`, named once for both of its readers. */
	outFilter: 'page-turn-out',
	inFilter: 'page-turn-in'
} as const;

/** The three worth turning by hand. Everything else is decided. */
export type PageTurnTuning = { durationMs: number; grain: number; hardness: number };

/** What each one may be, so a slider cannot ask for something absurd. */
export const PAGE_TURN_RANGES = {
	durationMs: { min: 60, max: 900, step: 10, label: 'Speed', unit: 'ms' },
	grain: { min: 0.2, max: 2, step: 0.05, label: 'Grain', unit: '' },
	hardness: { min: 2, max: 80, step: 1, label: 'Hardness', unit: '' }
} as const;
