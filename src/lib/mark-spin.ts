/**
 * The menu's mark, turning while a navigation drags — and landing on its feet.
 *
 * A CSS animation could start the turn but not finish it: taking the class
 * off mid-turn snaps the mark back to upright, and a snap is exactly the
 * flick this replaces. So the turn is driven here, and stopping is a request
 * rather than an event — the mark keeps going to the next full turn (the
 * modular arithmetic in `stopMarkSpin`) and rests upright, which reads as
 * "done" instead of "interrupted".
 *
 * The delay is the same fraction of the movement the spawned mark used to
 * wait: a navigation that finishes inside the slide never visibly spins.
 * While the wait is inside that delay, stopping costs nothing and shows
 * nothing.
 */
import { SLIDE_MS, WAIT_MARK_AT } from './slide';

/** One full turn, in milliseconds. */
export const TURN_MS = 1100;

const DELAY_MS = Math.round(SLIDE_MS * WAIT_MARK_AT);

let els: HTMLElement[] = [];
let raf = 0;
let angle = 0;
let last = 0;
let startedAt = 0;
let windingDown = false;
/** Where the wind-down rests: the next multiple of a full turn. */
let restAt = 0;

function paint(deg: number): void {
	for (const el of els) el.style.rotate = `${deg}deg`;
}

function rest(): void {
	cancelAnimationFrame(raf);
	raf = 0;
	angle = 0;
	last = 0;
	windingDown = false;
	for (const el of els) {
		el.style.removeProperty('rotate');
		el.style.removeProperty('transition');
	}
	els = [];
}

function frame(now: number): void {
	if (!last) last = now;
	const dt = now - last;
	last = now;

	// Inside the delay nothing has moved yet; a stop here is free.
	if (!windingDown && now - startedAt < DELAY_MS) {
		raf = requestAnimationFrame(frame);
		return;
	}

	angle += (dt / TURN_MS) * 360;
	if (windingDown && angle >= restAt) {
		rest();
		return;
	}
	paint(angle);
	raf = requestAnimationFrame(frame);
}

/** The wait is on: turn these. Calling again mid-wind-down keeps the turn. */
export function startMarkSpin(marks: (HTMLElement | null | undefined)[]): void {
	if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
		return;

	// Only the medallion turns — the rim of the mark stands still. The layer
	// is the Logo's own (`.mark-turn`); a root without one turns whole.
	els = marks
		.filter((el): el is HTMLElement => Boolean(el))
		.map((el) => el.querySelector<HTMLElement>('.mark-turn') ?? el);
	// The turn writes `rotate` every frame; a utility transition covering the
	// rotate property would smear each step into the next.
	for (const el of els) el.style.transition = 'none';

	if (raf) {
		// Still turning (or winding down): fold the new wait into the turn.
		windingDown = false;
		return;
	}
	angle = 0;
	last = 0;
	windingDown = false;
	startedAt = performance.now();
	raf = requestAnimationFrame(frame);
}

/** The wait is over: finish the turn in progress, then rest upright. */
export function stopMarkSpin(): void {
	if (!raf) return;
	if (angle === 0) {
		// Never left the delay — nothing was shown, so there is nothing to land.
		rest();
		return;
	}
	windingDown = true;
	restAt = Math.ceil(angle / 360) * 360;
}
