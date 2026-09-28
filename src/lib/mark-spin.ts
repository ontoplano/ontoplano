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
 * And it always goes round at least once. It used to wait out a fraction of
 * the room slide before moving, on the theory that a navigation finishing
 * inside the movement should leave no trace — which is true of a *warning*
 * and wrong of an answer to a press. On a desktop, where most navigations
 * land inside that fraction, the mark never moved at all: the thing that
 * tells you the app heard you was invisible exactly when the app was
 * quickest. So the turn starts on the press and `stopMarkSpin` carries it to
 * the next upright, which is a whole turn from a standing start.
 */

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

/** The most one frame may advance the turn by, however long it really took. */
const LONGEST_FRAME_MS = 1000 / 30;

/** Ease-out: quick at first, gentler as it approaches the top. */
const eased = (t: number) => 1 - (1 - t) * (1 - t);

/** Everybody waiting for the turn to land. See `stopMarkSpin`. */
let landed: (() => void)[] = [];

/** What turns: the mark's own octagon, and anything shaped like it behind it. */
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

/** The app's own marks carry this, so a turn can find them before anything hydrates. */
const MARK_SELECTOR = '[data-mark]';

function paint(deg: number): void {
	/*
	 * Asked afresh each frame. A load's turn starts on the marks the server
	 * rendered, and hydration can put new nodes in their place — on a phone,
	 * after the layout has already said it is done — and a stale list turned
	 * the detached ones while the ones on screen stood upright: the mark
	 * stopping dead mid-turn. The bird's layer is looked up again for the
	 * same reason.
	 */
	const found = document.querySelectorAll<HTMLElement>(MARK_SELECTOR);
	els = els.filter((el) => el.isConnected);
	for (const el of found) {
		if (els.includes(el)) continue;
		el.style.transition = 'none';
		els.push(el);
	}
	// The bird's layer turns back by `--mark-turn` in the Logo's own CSS, so a
	// layer hydration swaps in mid-turn is right from its first frame.
	for (const el of els) {
		el.style.rotate = `${deg}deg`;
		el.style.setProperty('--mark-turn', `${deg}deg`);
	}
}

/*
 * Taking the turn off without it showing.
 *
 * A root can carry a utility transition that covers `rotate` — the header's
 * mark does — and dropping the angle and the `transition: none` in one go
 * lets that transition play the angle back to zero: a quick turn backwards,
 * which is the flick at the end of a load. So the angle goes first, the style
 * is flushed, and only then does the transition come back.
 */
function settle(list: HTMLElement[]): void {
	for (const el of list) {
		el.style.removeProperty('rotate');
		el.style.removeProperty('--mark-turn');
	}
	if (list.length > 0) void list[0].offsetWidth;
	for (const el of list) el.style.removeProperty('transition');
}

function rest(): void {
	cancelAnimationFrame(raf);
	raf = 0;
	angle = 0;
	last = 0;
	windingDown = false;
	hint = 0;
	settle(els);
	els = [];
	// Whoever was waiting for it to come to rest — the chooser leaves when it
	// has, so that the turn is finished rather than cut off by a navigation.
	const waiting = landed;
	landed = [];
	for (const done of waiting) done();
}

function frame(now: number): void {
	if (!last) last = now;
	// A long frame — a load hydrating — slows the turn rather than skipping a
	// piece of it, so it never jumps round to upright and calls that landing.
	const dt = Math.min(now - last, LONGEST_FRAME_MS);
	last = now;

	/*
	 * How fast it is turning this frame.
	 *
	 * Winding up from `SLOWEST` over `SPIN_UP_MS`, and — once it has been told
	 * to stop — running down again over the last `DECEL_DEGREES` before the
	 * upright it is aiming at. Never all the way to nothing, or it would
	 * approach the resting place without ever arriving.
	 */
	const wound = eased(Math.min(1, (now - startedAt) / SPIN_UP_MS));
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
 * `direction` is the navigation's own — the octagon turns with the rooms
 * rather than always the one way. Calling again mid-wind-down keeps the turn,
 * taking the new direction with it.
 */
export function startMarkSpin(
	marks: (HTMLElement | null | undefined)[],
	direction: number = 0
): void {
	if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
		return;

	/*
	 * The octagon turns and the bird inside it stands still.
	 *
	 * Each root turns whole — the rim, and the octagon the phone bar's button
	 * is clipped to, so the clip goes round with the drawing instead of cutting
	 * its corners off — and the medallion inside it (the Logo's `.mark-still`)
	 * is turned back by the same angle in the same frame. A root without one,
	 * the bar's ground behind the button, just turns with the rest.
	 *
	 * Calling again mid-turn adds whatever is new and keeps the angle, so a
	 * mark that was re-rendered picks the turn up where it was rather than
	 * starting upright while the old one is taken off.
	 */
	const roots = marks.filter((el): el is HTMLElement => Boolean(el));
	for (const el of roots) if (!els.includes(el)) els.push(el);
	els = els.filter((el) => el.isConnected || roots.includes(el));
	for (const el of els) el.style.transition = 'none';
	if (raf) paint(angle);

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
	if (!raf) return Promise.resolve();
	const settled = new Promise<void>((resolve) => landed.push(resolve));
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
