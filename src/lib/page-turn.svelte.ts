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
 * The dissolve, in two halves, driven from script.
 *
 * It used to be a View Transition: the browser photographed the old screen and
 * the new one and the filter ran over those snapshots. That is why it was
 * Chromium-only — Firefox has `startViewTransition` and draws nothing into a
 * filtered `::view-transition-old` — and it is also why the timing was wrong.
 * A view transition cannot begin until the new page is ready, so on a phone the
 * loading bar appeared, the page arrived, and *then* the screen dissolved. The
 * half that should cover the wait happened after it.
 *
 * So the filter is applied to the page itself, which every engine can do, and
 * the two halves are separate: the old screen breaks up the moment a
 * navigation starts, and the new one arrives out of the same noise once it is
 * there. Both read one field, so a dot leaving is a dot arriving.
 *
 * The cost is that the page is rasterised while it turns, where a snapshot was
 * already flat. At this duration that is affordable; at five times it, it
 * would not be.
 */

/** Half a turn: out while the page is fetched, in when it lands. */
const HALF = () => PAGE_TURN.durationMs / 2;

/** The frame loop in flight, so a second navigation replaces the first. */
let running = 0;

function ramp(filterId: string, from: number, to: number, onDone?: () => void): void {
	const el = document.getElementById(`${filterId}-ramp`);
	if (!el) {
		onDone?.();
		return;
	}

	const { hardness } = PAGE_TURN;
	const duration = HALF();
	const started = performance.now();
	const mine = ++running;

	function frame(now: number) {
		if (mine !== running) return;
		const t = Math.min(1, (now - started) / duration);
		const at = from + (to - from) * t;
		el!.setAttribute('slope', String(hardness));
		el!.setAttribute('intercept', String(1 - hardness * at));
		if (t < 1) requestAnimationFrame(frame);
		else onDone?.();
	}

	// The first frame now rather than next tick: on a turn this short, one
	// frame of the previous state reads as a flick rather than as ink.
	frame(started);
}

/** Whether the app should turn at all. Nothing to detect but the preference. */
export function turnsPages(): boolean {
	return (
		typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/**
 * Break the page up. Called the moment a navigation starts — the same moment
 * the loading bar appears — so the wait is covered rather than followed.
 */
export function turnOut(page: HTMLElement | undefined): void {
	if (!page || !turnsPages()) return;
	page.style.filter = `url('#${PAGE_TURN_DEFAULTS.outFilter}')`;
	ramp(PAGE_TURN_DEFAULTS.outFilter, 0, 1);
}

/** And let the new one arrive out of the gaps the old one left. */
export function turnIn(page: HTMLElement | undefined): void {
	if (!page) return;
	if (!turnsPages()) {
		page.style.filter = '';
		return;
	}
	page.style.filter = `url('#${PAGE_TURN_DEFAULTS.outFilter}')`;
	ramp(PAGE_TURN_DEFAULTS.outFilter, 1, 0, () => {
		// Nothing is filtered while nothing is turning: the filter forces the
		// page to be rasterised, and a page that is not moving should not pay
		// for that.
		page.style.filter = '';
	});
}
