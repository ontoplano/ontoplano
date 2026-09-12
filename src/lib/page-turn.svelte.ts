/**
 * The dissolve's numbers, and the loop that uses them.
 *
 * Split from `page-turn.ts` because that file is read by things that are not
 * Svelte — the end-to-end test imports the defaults to assert against — and a
 * module holding Svelte state cannot be loaded by plain Node.
 *
 * The numbers themselves are `PAGE_TURN_DEFAULTS`, in that file, and changing
 * the feel of the dissolve means editing them there. There was a screen with
 * sliders on it that turned them while the app ran; it is gone. This is three
 * numbers in one file, not a setting, and certainly not a setting with a page.
 */
import { PAGE_TURN_DEFAULTS, type PageTurnTuning } from './page-turn.js';

/** What is in force. One place, read wherever the dissolve is drawn. */
export const PAGE_TURN: PageTurnTuning = PAGE_TURN_DEFAULTS;

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
	const out = document.getElementById(`${PAGE_TURN_DEFAULTS.outFilter}-ramp`);
	const into = document.getElementById(`${PAGE_TURN_DEFAULTS.inFilter}-ramp`);
	if (!out || !into) return;

	// Read once per turn, not once per frame: the numbers may be moving under
	// somebody's thumb, and a turn that changed speed halfway through would
	// tell them nothing about either speed.
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
