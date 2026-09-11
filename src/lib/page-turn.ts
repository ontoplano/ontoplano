/**
 * How changing screen looks, and the one loop that drives it.
 *
 * The dissolve is an SVG turbulence filter thresholded hard enough that every
 * pixel snaps fully on or fully off, with the threshold slid across the screen
 * over the length of the turn. Both halves read one noise field, so a dot
 * leaving the old screen is the dot arriving on the new one — which is what
 * makes it read as ink flipping rather than two pictures fading past
 * each other.
 *
 * It is driven from here rather than from CSS because no CSS animation can
 * reach inside a filter to move `intercept`. That is also the cost: turbulence
 * is computed over the viewport every frame, on the CPU. It is affordable at
 * this duration and would not be at five times it.
 */
export const PAGE_TURN = {
	/**
	 * How long the dissolve takes, end to end.
	 *
	 * The knob worth touching. Change it and reload; nothing else has to move.
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

/**
 * Slide the threshold across both halves for the length of one turn.
 *
 * `alpha = slope × noise + intercept`, clamped — so with a large slope the
 * result is 0 or 1 almost everywhere and the intercept decides where the edge
 * falls. Sweeping it from one end to the other is the dissolve. The incoming
 * half runs the same ramp with the slope negated, which is exactly the
 * complement of the outgoing one over the same noise.
 */
export function runDissolve(): void {
	const out = document.getElementById(`${PAGE_TURN.outFilter}-ramp`);
	const into = document.getElementById(`${PAGE_TURN.inFilter}-ramp`);
	if (!out || !into) return;

	const { durationMs, hardness } = PAGE_TURN;
	const started = performance.now();

	function frame(now: number) {
		const t = Math.min(1, (now - started) / durationMs);

		out!.setAttribute('slope', String(hardness));
		out!.setAttribute('intercept', String(1 - hardness * t));
		into!.setAttribute('slope', String(-hardness));
		into!.setAttribute('intercept', String(hardness * t));

		if (t < 1) requestAnimationFrame(frame);
	}

	/*
	 * The first frame is set here and now, not scheduled.
	 *
	 * A turn begins with the filters holding whatever the last one left them at
	 * — the outgoing screen fully erased — so waiting a frame to correct that
	 * painted one frame of nothing before the dissolve started. On a short turn
	 * that single frame is a large share of the whole thing, and it read as a
	 * flick rather than as ink. Setting `t = 0` synchronously means the browser
	 * never gets a chance to show the leftover state.
	 */
	frame(started);
}
