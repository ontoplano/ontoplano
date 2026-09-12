/**
 * The dissolve's numbers while the app is running, and the loop that uses them.
 *
 * Split from `page-turn.ts` because that file is read by things that are not
 * Svelte — the end-to-end test imports the defaults to assert against — and a
 * module holding `$state` cannot be loaded by plain Node. Defaults and ranges
 * live there; what is in force right now lives here.
 */
import { PAGE_TURN_DEFAULTS, type PageTurnTuning } from './page-turn.js';

const STORED_AT = 'ontoplano:page-turn';

function stored(): Partial<PageTurnTuning> {
	if (typeof localStorage === 'undefined') return {};
	try {
		return JSON.parse(localStorage.getItem(STORED_AT) ?? '{}') as Partial<PageTurnTuning>;
	} catch {
		return {};
	}
}

/**
 * The values in force, which a tuner may change while the app is running.
 *
 * The point of this is to be watched rather than reasoned about: the feel of
 * a dissolve is not something anybody gets right by reading three numbers, so
 * the numbers move under your thumb and the next screen change uses them.
 * Kept in the browser it is being watched in — this is not a preference and
 * does not belong to the account.
 */
export const PAGE_TURN: PageTurnTuning = $state({
	durationMs: PAGE_TURN_DEFAULTS.durationMs,
	grain: PAGE_TURN_DEFAULTS.grain,
	hardness: PAGE_TURN_DEFAULTS.hardness,
	...stored()
});

/** Remember what is on screen now, for the next page and the next launch. */
export function keepPageTurn(): void {
	if (typeof localStorage === 'undefined') return;
	const { durationMs, grain, hardness } = PAGE_TURN;
	localStorage.setItem(STORED_AT, JSON.stringify({ durationMs, grain, hardness }));
}

/** Back to what the app ships with. */
export function resetPageTurn(): void {
	PAGE_TURN.durationMs = PAGE_TURN_DEFAULTS.durationMs;
	PAGE_TURN.grain = PAGE_TURN_DEFAULTS.grain;
	PAGE_TURN.hardness = PAGE_TURN_DEFAULTS.hardness;
	if (typeof localStorage !== 'undefined') localStorage.removeItem(STORED_AT);
}

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
