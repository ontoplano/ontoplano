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
/** Which way it turns: the way the screens are moving, +1 or -1. */
let spin = 1;
/**
 * A direction whispered by a slide the layout cannot see — a tab's. The
 * layout starts the spin, but a tab change is the room's own movement; the
 * room says which way it went and the next start takes it, once.
 */
let hint = 0;

export function hintMarkSpin(direction: number): void {
	hint = direction;
}
/** Where the wind-down rests: the next full turn, in the turn's own direction. */
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
	hint = 0;
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

	angle += spin * (dt / TURN_MS) * 360;
	if (windingDown && (spin > 0 ? angle >= restAt : angle <= restAt)) {
		rest();
		return;
	}
	paint(angle);
	raf = requestAnimationFrame(frame);
}

/**
 * The wait is on: turn these, the way the screens are moving.
 *
 * `direction` is the navigation's own — the medallion turns with the rooms
 * rather than always the one way. Calling again mid-wind-down keeps the turn,
 * taking the new direction with it.
 */
export function startMarkSpin(
	marks: (HTMLElement | null | undefined)[],
	direction: number = 0
): void {
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

	// The rooms' direction wins; a tab's hint speaks when the rooms did not
	// move; with neither, the turn keeps its old clockwise.
	const asked = direction || hint || 1;
	hint = 0;
	spin = asked < 0 ? -1 : 1;
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
	restAt = (spin > 0 ? Math.ceil(angle / 360) : Math.floor(angle / 360)) * 360;
}
