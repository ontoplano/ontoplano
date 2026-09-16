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

/** One full turn, in milliseconds, at full speed. */
export const TURN_MS = 300;

/**
 * It does not start at full speed, and it does not stop at it either.
 *
 * A turn that snaps to its top speed reads as a video starting; a wheel that
 * is given a push winds up, holds, and runs down as it settles. `SPIN_UP_MS`
 * is how long the winding takes, `SLOWEST` is the fraction of full speed it
 * begins and ends at, and `DECEL_DEGREES` is how far out from its resting
 * place it starts easing off.
 *
 * These three are the whole feel of it. Longer `SPIN_UP_MS` or lower
 * `SLOWEST` make the wind-up more pronounced; bigger `DECEL_DEGREES` makes it
 * coast further before it settles.
 */
const SPIN_UP_MS = 1000;
const SLOWEST = 0.5;
const DECEL_DEGREES = 90;

/** Ease-out: quick at first, gentler as it approaches the top. */
const eased = (t: number) => 1 - (1 - t) * (1 - t);

const DELAY_MS = Math.round(SLIDE_MS * WAIT_MARK_AT);

/**
 * The delay, for this turn only.
 *
 * Nothing is shown inside it, which is right when the turn is a *warning* that
 * a room is taking its time: a navigation that finishes first should leave no
 * trace. It is wrong when the turn is the answer to a press — the instance
 * chooser opens a copy on the same phone, which is faster than the delay, so
 * the mark never moved at all and the press looked ignored.
 */
let delayMs = DELAY_MS;

/** Everybody waiting for the turn to land. See `stopMarkSpin`. */
let landed: (() => void)[] = [];

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
	delayMs = DELAY_MS;
	// Whoever was waiting for it to come to rest — the chooser leaves when it
	// has, so that the turn is finished rather than cut off by a navigation.
	const waiting = landed;
	landed = [];
	for (const done of waiting) done();
}

function frame(now: number): void {
	if (!last) last = now;
	const dt = now - last;
	last = now;

	// Inside the delay nothing has moved yet; a stop here is free.
	if (!windingDown && now - startedAt < delayMs) {
		raf = requestAnimationFrame(frame);
		return;
	}

	/*
	 * How fast it is turning this frame.
	 *
	 * Winding up from `SLOWEST` over `SPIN_UP_MS`, and — once it has been told
	 * to stop — running down again over the last `DECEL_DEGREES` before the
	 * upright it is aiming at. Never all the way to nothing, or it would
	 * approach the resting place without ever arriving.
	 */
	const wound = eased(Math.min(1, (now - startedAt - delayMs) / SPIN_UP_MS));
	const left = Math.abs(restAt - angle);
	const landing = windingDown ? Math.min(1, left / DECEL_DEGREES) : 1;
	const rate = SLOWEST + (1 - SLOWEST) * Math.min(wound, landing);

	angle += spin * rate * (dt / TURN_MS) * 360;
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
	direction: number = 0,
	/** Skip the delay: the turn is the answer to a press, not a warning. */
	atOnce = false
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
	delayMs = atOnce ? 0 : DELAY_MS;
	startedAt = performance.now();
	raf = requestAnimationFrame(frame);
}

/**
 * The wait is over: finish the turn in progress, then rest upright.
 *
 * Answers when it has actually come to rest, for the one caller that has to
 * wait for the landing rather than merely ask for it: the instance chooser
 * leaves the page when the turn is finished, and leaving mid-turn is the snap
 * this whole file exists to avoid.
 */
export function stopMarkSpin(): Promise<void> {
	if (!raf) return Promise.resolve();
	const settled = new Promise<void>((resolve) => landed.push(resolve));
	/*
	 * Still inside the delay: nothing was drawn, so there is nothing to land.
	 *
	 * This asked whether the angle was zero, which is the same thing only if a
	 * frame has moved it — and the first frame never does: it has no previous
	 * timestamp, so its `dt` is zero and the angle stays put. A caller that
	 * starts a turn and asks it to stop straight away therefore always took
	 * this branch and never turned at all, which is what the instance chooser
	 * did. The delay is what the shortcut is actually about.
	 */
	if (performance.now() - startedAt < delayMs) {
		rest();
		return settled;
	}
	windingDown = true;
	/*
	 * The next upright far enough away to slow down into.
	 *
	 * Stopping at the very next one can mean a few degrees, which is a stop
	 * rather than a landing — so if there is not most of a turn left to slow
	 * over, it goes round once more.
	 */
	const next = (spin > 0 ? Math.ceil(angle / 360) : Math.floor(angle / 360)) * 360;
	restAt = Math.abs(next - angle) < DECEL_DEGREES * 0.5 ? next + spin * 360 : next;
	return settled;
}
