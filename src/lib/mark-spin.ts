/**
 * The menu's mark, turning while a navigation drags — and landing on its feet.
 *
 * A CSS class could start the turn but not finish it: taking the class off
 * mid-turn snaps the mark back to upright, and a snap is exactly the flick
 * this replaces. So stopping is a request rather than an event — the mark
 * keeps going to the next full turn and rests upright, which reads as "done"
 * instead of "interrupted".
 *
 * And it always goes round at least once. On a desktop most navigations land
 * inside a fraction of a turn, and a mark that waited before moving never
 * moved at all: the thing that tells you the app heard you was invisible
 * exactly when the app was quickest. So the turn starts on the press and
 * `stopMarkSpin` carries it to the next upright, which is a whole turn from a
 * standing start.
 *
 * **The browser turns it, not this file.** It used to be a
 * `requestAnimationFrame` loop writing an angle every frame, and the end of a
 * load is exactly when the main thread stops handing out frames — the new page
 * is being rendered on it. The mark froze mid-turn, then lurched on and
 * landed. Now the whole motion — wind-up, running, landing — is worked out
 * here as keyframes and handed to the Web Animations API, which plays a
 * `rotate` on the compositor whether or not the page is busy. This file only
 * speaks when something changes: a start, a stop, a new direction, a mark
 * that hydration put in the old one's place.
 */

/** One full turn, in milliseconds, at full speed. */
export const TURN_MS = 300;

/**
 * It does not start at full speed, and it does not stop at it either.
 *
 * A turn that snaps to its top speed reads as a video starting; a wheel that
 * is given a push winds up, holds, and runs down as it settles. `SPIN_UP_MS`
 * is how long the winding takes, `SLOWEST` is the fraction of full speed it
 * begins at, and `DECEL_DEGREES` is how far out from its resting place it
 * starts easing off.
 *
 * These three are the whole feel of it. Longer `SPIN_UP_MS` or lower
 * `SLOWEST` make the wind-up more pronounced; bigger `DECEL_DEGREES` makes it
 * coast further before it settles.
 */
export const SPIN_UP_MS = 1000;
export const SLOWEST = 0.5;
export const DECEL_DEGREES = 180;

/**
 * The least speed a landing is worked out at, as a fraction of full.
 *
 * The run-down goes to rest the way a wheel does — speed falling with the
 * square root of the distance left, which is an even braking — and that
 * arrives in a finite time on paper but creeps in steps of a millisecond.
 * This is only the floor that makes the arithmetic finish; at this speed the
 * last fraction of a degree is invisible.
 */
const STOP_FLOOR = 0.02;

/** How far apart the keyframes of a curved stretch are. Linear between them. */
const KEYFRAME_MS = 1000 / 60;

/** The step the landing is worked out in. Finer than any frame. */
const LANDING_STEP_MS = 1;

const DEGREES_PER_MS = 360 / TURN_MS;

/** Ease-out: quick at first, gentler as it approaches the top. */
const eased = (t: number) => 1 - (1 - t) * (1 - t);

/** How wound up it is, `elapsed` ms after it was set going: 0 to 1. */
const wound = (elapsed: number) => eased(Math.min(1, elapsed / SPIN_UP_MS));

/**
 * How far a turn nobody has stopped has gone, `elapsed` ms after it started.
 *
 * The speed is `SLOWEST` of full, rising along `eased` to full over
 * `SPIN_UP_MS`; this is that speed added up, in closed form, so the angle at
 * any moment is known without having watched the moments before it.
 */
export function runDistance(elapsed: number): number {
	const t = Math.max(0, elapsed);
	const T = SPIN_UP_MS;
	const winding = t < T ? (t * t) / T - (t * t * t) / (3 * T * T) : (2 * T) / 3 + (t - T);
	return DEGREES_PER_MS * (SLOWEST * t + (1 - SLOWEST) * winding);
}

/** One point of a stretch of turn: when, in ms from its start, and at what angle. */
export type TurnPoint = { at: number; angle: number };

/**
 * A running turn from where it is now: the rest of the wind-up, then a loop.
 *
 * `windUp` is empty once it is at full speed. `loop` is one revolution at full
 * speed, from wherever the wind-up left it, to be repeated for as long as the
 * wait lasts — it starts the moment `windUp` ends.
 */
export function runningTurn(
	from: number,
	elapsed: number,
	spin: 1 | -1
): { windUp: TurnPoint[]; loop: TurnPoint[] } {
	const windUp: TurnPoint[] = [];
	const left = SPIN_UP_MS - elapsed;
	if (left > 0) {
		const steps = Math.max(1, Math.ceil(left / KEYFRAME_MS));
		for (let i = 0; i <= steps; i += 1) {
			const at = (left * i) / steps;
			const angle = from + spin * (runDistance(elapsed + at) - runDistance(elapsed));
			windUp.push({ at, angle });
		}
	}
	const start = windUp.length > 0 ? windUp[windUp.length - 1].angle : from;
	return {
		windUp,
		loop: [
			{ at: 0, angle: start },
			{ at: TURN_MS, angle: start + spin * 360 }
		]
	};
}

/**
 * Where a stop asked for at `from` comes to rest: the next full turn in the
 * turn's own direction — unless that is too close to slow down into, which
 * would be a halt rather than a landing, and then the one after.
 */
export function restingPlace(from: number, spin: 1 | -1): number {
	const next = (spin > 0 ? Math.ceil(from / 360) : Math.floor(from / 360)) * 360;
	// The whole run-down has to fit, or the braking would start mid-way —
	// a sudden drop in speed where the landing begins.
	return Math.abs(next - from) < DECEL_DEGREES ? next + spin * 360 : next;
}

/**
 * The landing: from `from`, `elapsed` ms into the turn, to `restAt`.
 *
 * Still winding up if it was stopped early, and braking evenly over the last
 * `DECEL_DEGREES`, all the way to still. It used to run down only to
 * `SLOWEST` and stop dead from there — half speed to nothing in one frame,
 * which is the jolt a landing is meant to avoid. The last point is `restAt`
 * exactly.
 */
export function landingTurn(
	from: number,
	elapsed: number,
	spin: 1 | -1,
	restAt: number
): TurnPoint[] {
	const points: TurnPoint[] = [{ at: 0, angle: from }];
	let angle = from;
	let t = 0;
	let sinceKept = 0;
	while (spin > 0 ? angle < restAt : angle > restAt) {
		const landing = Math.sqrt(Math.min(1, Math.abs(restAt - angle) / DECEL_DEGREES));
		const winding = SLOWEST + (1 - SLOWEST) * wound(elapsed + t);
		const rate = Math.max(STOP_FLOOR, Math.min(winding, landing));
		angle += spin * rate * LANDING_STEP_MS * DEGREES_PER_MS;
		t += LANDING_STEP_MS;
		sinceKept += LANDING_STEP_MS;
		if (sinceKept >= KEYFRAME_MS) {
			sinceKept = 0;
			points.push({ at: t, angle: spin > 0 ? Math.min(angle, restAt) : Math.max(angle, restAt) });
		}
	}
	if (points[points.length - 1].angle !== restAt) points.push({ at: t, angle: restAt });
	return points;
}

/** The angle a stretch of turn is at, `at` ms into it. */
export function angleAlong(points: TurnPoint[], at: number): number {
	if (points.length === 0) return 0;
	if (at <= points[0].at) return points[0].angle;
	for (let i = 1; i < points.length; i += 1) {
		const b = points[i];
		if (at <= b.at) {
			const a = points[i - 1];
			return a.angle + ((b.angle - a.angle) * (at - a.at)) / (b.at - a.at || 1);
		}
	}
	return points[points.length - 1].angle;
}

/*
 * What is playing now, as a description rather than a loop: enough to say
 * where the mark is at any moment, and to put the same motion on a mark that
 * turns up halfway through.
 */
type Stretch =
	| { kind: 'running'; begun: number; windUp: TurnPoint[]; loop: TurnPoint[] }
	| { kind: 'landing'; begun: number; points: TurnPoint[] };

let stretch: Stretch | null = null;
/** When the turn was set going — the wind-up is counted from here. */
let startedAt = 0;
/** Which way it turns: the way the screens are moving, +1 or -1. */
let spin: 1 | -1 = 1;
/** What turns: the mark's own octagon, and anything shaped like it behind it. */
let els: HTMLElement[] = [];
/** Everything playing, so a change of plan can take it all off at once. */
let playing: Animation[] = [];
/** Every layer something is playing on, to notice one hydration swapped in. */
let turning = new WeakSet<Element>();
let watcher: MutationObserver | null = null;
let landingTimer: ReturnType<typeof setTimeout> | undefined;
/** Everybody waiting for the turn to land. See `stopMarkSpin`. */
let landed: (() => void)[] = [];
/**
 * A direction whispered by a slide the layout cannot see — a tab's. The
 * layout starts the spin, but a tab change is the room's own movement; the
 * room says which way it went and the next start takes it, once.
 */
let hint = 0;

export function hintMarkSpin(direction: number): void {
	hint = direction;
}

/** The app's own marks carry this, so a turn can find them before anything hydrates. */
const MARK_SELECTOR = '[data-mark]';
/**
 * The only part of a mark that turns: the rim. The bird is a separate layer
 * nothing ever animates, so there is no second animation for it to fall out
 * of step with — it used to be turned back by the same angle as the whole
 * mark, and every frame the two disagreed was a frame the puffin moved.
 */
const TURN_SELECTOR = '.mark-turn';
/** On a mark while it turns: lifts the octagon clip, which would cut the rim's corners. */
const TURNING_ATTRIBUTE = 'data-turning';

/** The clock the animations run on. */
function now(): number {
	const t = document.timeline?.currentTime;
	return typeof t === 'number' ? t : performance.now();
}

/** Where the mark is, `at` on the animations' clock. */
function angleAt(at: number): number {
	if (!stretch) return 0;
	const into = at - stretch.begun;
	if (stretch.kind === 'landing') return angleAlong(stretch.points, into);
	const { windUp, loop } = stretch;
	const upFor = windUp.length > 0 ? windUp[windUp.length - 1].at : 0;
	if (into < upFor) return angleAlong(windUp, into);
	return angleAlong(loop, (into - upFor) % TURN_MS);
}

function frames(points: TurnPoint[]): Keyframe[] {
	const span = points[points.length - 1].at - points[0].at || 1;
	return points.map((p) => ({
		offset: (p.at - points[0].at) / span,
		rotate: `${p.angle}deg`
	}));
}

/** The layers of a mark that turn: its rim, or the mark itself when it is one. */
function rims(root: HTMLElement): HTMLElement[] {
	if (root.matches(TURN_SELECTOR)) return [root];
	return [...root.querySelectorAll<HTMLElement>(TURN_SELECTOR)];
}

/** Put what is playing on one mark's rim. Nothing else in it moves. */
function play(root: HTMLElement): void {
	if (!stretch) return;
	root.setAttribute(TURNING_ATTRIBUTE, '');
	for (const el of rims(root)) {
		const pieces: [TurnPoint[], KeyframeAnimationOptions][] = [];
		if (stretch.kind === 'landing') {
			const { points } = stretch;
			pieces.push([points, { duration: points[points.length - 1].at }]);
		} else {
			const { windUp, loop } = stretch;
			const upFor = windUp.length > 0 ? windUp[windUp.length - 1].at : 0;
			if (upFor > 0) pieces.push([windUp, { duration: upFor }]);
			pieces.push([loop, { duration: TURN_MS, delay: upFor, iterations: Infinity }]);
		}
		for (const [points, options] of pieces) {
			const animation = el.animate(frames(points), {
				...options,
				easing: 'linear',
				fill: 'none'
			});
			// Every mark on one clock: a mark hydration put in later picks the
			// turn up exactly where the others are, not from its beginning.
			animation.startTime = stretch.begun;
			playing.push(animation);
			turning.add(el);
		}
	}
}

function playEverywhere(): void {
	for (const animation of playing) animation.cancel();
	playing = [];
	turning = new WeakSet();
	for (const el of els) play(el);
}

/*
 * A load's turn starts on the marks the server rendered, and hydration can
 * put new nodes in their place — on a phone, after the layout has already
 * said it is done. Whatever appears carrying `data-mark` joins the turn, and
 * so does a rim swapped in inside a mark that was already turning, all put
 * back on together, on the one clock, so nothing jumps.
 */
function adopt(): void {
	els = els.filter((el) => el.isConnected);
	const stranded = els.some((el) => rims(el).some((rim) => !turning.has(rim)));
	if (stranded) playEverywhere();
	for (const el of document.querySelectorAll<HTMLElement>(MARK_SELECTOR)) {
		if (els.includes(el)) continue;
		els.push(el);
		play(el);
	}
}

function watch(): void {
	if (watcher || typeof MutationObserver !== 'function') return;
	watcher = new MutationObserver(adopt);
	watcher.observe(document.body, { childList: true, subtree: true });
}

function rest(): void {
	clearTimeout(landingTimer);
	landingTimer = undefined;
	watcher?.disconnect();
	watcher = null;
	/*
	 * Nothing to snap back: the landing ended on a whole turn, and with the
	 * animations gone the mark is at its own resting angle, which is the same
	 * picture.
	 */
	for (const animation of playing) animation.cancel();
	playing = [];
	turning = new WeakSet();
	stretch = null;
	for (const el of els) el.removeAttribute(TURNING_ATTRIBUTE);
	els = [];
	hint = 0;
	// Whoever was waiting for it to come to rest — the chooser leaves when it
	// has, so that the turn is finished rather than cut off by a navigation.
	const waiting = landed;
	landed = [];
	for (const done of waiting) done();
}

/**
 * The wait is on: turn these, the way the screens are moving.
 *
 * `direction` is the navigation's own — the octagon turns with the rooms
 * rather than always the one way. Calling again mid-turn or mid-landing keeps
 * the angle and the wind-up, taking the new direction with it.
 */
export function startMarkSpin(
	marks: (HTMLElement | null | undefined)[],
	direction: number = 0
): void {
	if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
		return;
	if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;

	const roots = marks.filter((el): el is HTMLElement => Boolean(el));
	for (const el of roots) if (!els.includes(el)) els.push(el);
	els = els.filter((el) => el.isConnected || roots.includes(el));

	// The rooms' direction wins; a tab's hint speaks when the rooms did not
	// move; with neither, the turn keeps its old clockwise.
	const asked = direction || hint || 1;
	hint = 0;
	const was = spin;
	spin = asked < 0 ? -1 : 1;

	const at = now();
	if (stretch?.kind === 'running' && spin === was) {
		// Already turning this way: the same motion, put on the marks as they
		// now are — on one clock, so the ones already turning do not move.
		playEverywhere();
		return;
	}

	const from = stretch ? angleAt(at) : 0;
	if (!stretch) startedAt = at;
	clearTimeout(landingTimer);
	landingTimer = undefined;
	stretch = { kind: 'running', begun: at, ...runningTurn(from, at - startedAt, spin) };
	playEverywhere();
	watch();
}

/**
 * The wait is over: finish the turn in progress, then rest upright.
 *
 * "Finish" is the whole of it. A navigation that lands in forty milliseconds
 * asks for this while the mark has barely moved, and the answer is not to stop
 * — it is to carry on to the next upright, which from a standing start is one
 * full turn. So the quickest navigation and the slowest one both leave a mark
 * that went round and came to rest, and only the number of turns differs.
 *
 * Answers when it has actually come to rest, for the one caller that has to
 * wait for the landing rather than merely ask for it: the instance chooser
 * leaves the page when the turn is finished, and leaving mid-turn is the snap
 * this whole file exists to avoid.
 */
export function stopMarkSpin(): Promise<void> {
	if (!stretch) return Promise.resolve();
	const settled = new Promise<void>((resolve) => landed.push(resolve));
	if (stretch.kind === 'landing') return settled;

	const at = now();
	const from = angleAt(at);
	const points = landingTurn(from, at - startedAt, spin, restingPlace(from, spin));
	stretch = { kind: 'landing', begun: at, points };
	playEverywhere();
	/*
	 * A timer, not the animation's own `finished`: a mark swapped out by
	 * hydration takes its animation with it. Late is harmless — the landing's
	 * last frame is a whole turn, which looks exactly like no turn at all.
	 */
	landingTimer = setTimeout(rest, points[points.length - 1].at);
	return settled;
}
