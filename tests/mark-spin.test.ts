/**
 * @vitest-environment happy-dom
 */
/**
 * The turn that says "working", and the two ways it stopped saying it.
 *
 * Both were found on the instance chooser, where the mark turns while an
 * instance opens, and both looked like the animation simply not being there:
 *
 *   **It never started.** `startMarkSpin` keeps a delay before it paints, so
 *   that a room which loads quickly leaves no trace. The copy of ontoplano on
 *   the phone loads faster than the delay, so the press looked ignored. That
 *   is what `atOnce` is for.
 *
 *   **It stopped after one turn.** `stopMarkSpin` had a shortcut for the wait
 *   that ended inside the delay: angle still zero, nothing drawn, rest at
 *   once. But the first frame never moves the angle — it has no previous
 *   timestamp, so its `dt` is zero — which made "start, then stop" always take
 *   that shortcut. The shortcut is about the delay, and now says so.
 *
 * Driven by hand: `requestAnimationFrame` and `performance.now` are the clock
 * this file runs on, so the test owns both and the turn is examined frame by
 * frame rather than waited for.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/*
 * A fresh module per test.
 *
 * The turn is module state — the frame handle, the angle, which elements are
 * turning — because there is one mark and one wait in the app. A test that
 * left a turn running would hand the next one a module that thinks it is
 * already spinning, and `startMarkSpin` would fold into it and paint nothing.
 */
type Spin = typeof import('../src/lib/mark-spin');
let startMarkSpin: Spin['startMarkSpin'];
let stopMarkSpin: Spin['stopMarkSpin'];

/** The frames this test hands out, and the clock they carry. */
let pending: ((now: number) => void)[] = [];
let clock = 0;

/** Run one frame, `ms` after the last. */
function frame(ms = 16): void {
	clock += ms;
	const due = pending;
	pending = [];
	for (const run of due) run(clock);
}

function frames(count: number, ms = 16): void {
	for (let i = 0; i < count; i += 1) frame(ms);
}

/** What the mark is turned to, in degrees, as the spin writes it. */
function angleOf(el: HTMLElement): number {
	return parseFloat(el.style.rotate || '0');
}

/**
 * Whether the turn has come to rest: it is asking for no more frames.
 *
 * Not "is the rotate property gone" — happy-dom keeps `style.rotate` after
 * `removeProperty`, so that assertion tests this environment's CSS support
 * rather than the app. A browser does remove it, and either way the thing
 * worth holding is that the loop stopped rather than being abandoned.
 */
function stillTurning(): boolean {
	return pending.length > 0;
}

let mark: HTMLElement;

beforeEach(async () => {
	clock = 0;
	pending = [];
	vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
		pending.push(cb);
		return pending.length;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {});
	vi.stubGlobal('performance', { now: () => clock });
	// No opinion about motion: the real one is asked, and jsdom has none.
	vi.stubGlobal('matchMedia', () => ({ matches: false }));

	document.body.innerHTML = '';
	mark = document.createElement('div');
	document.body.append(mark);

	vi.resetModules();
	({ startMarkSpin, stopMarkSpin } = await import('../src/lib/mark-spin'));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the turn that answers a press', () => {
	test('starts painting at once, rather than after a delay', () => {
		startMarkSpin([mark], 0);
		frames(4);
		expect(angleOf(mark), 'nothing was drawn').toBeGreaterThan(0);
	});

	/**
	 * There is no quiet version any more.
	 *
	 * The turn used to sit still for a fraction of the room slide, so that a
	 * navigation finishing inside the movement left no trace. That is right for
	 * a *warning* that something is slow and wrong for an answer to a press: on
	 * a desktop most navigations land inside that fraction, so the one thing
	 * saying "heard you" was invisible exactly when the app was quickest.
	 */
	test('every turn moves, however the caller asked for it', () => {
		startMarkSpin([mark]);
		frames(4);
		expect(angleOf(mark)).toBeGreaterThan(0);
	});
});

describe('a turn nobody has stopped', () => {
	test('keeps going past a full revolution, for as long as the wait lasts', () => {
		startMarkSpin([mark], 0);
		frames(120);
		// Several revolutions in, and still turning: the wait is what ends it.
		expect(angleOf(mark)).toBeGreaterThan(720);
		const far = angleOf(mark);
		frames(30);
		expect(angleOf(mark)).toBeGreaterThan(far);
	});
});

describe('a turn that has been asked to stop', () => {
	test('finishes its revolution and rests upright', async () => {
		startMarkSpin([mark], 0);
		frames(20);
		const caught = angleOf(mark);
		expect(caught).toBeGreaterThan(0);

		const landed = stopMarkSpin();
		// Long enough for the wind-down, which finishes the turn it is in.
		frames(200);
		await expect(landed).resolves.toBeUndefined();
		expect(stillTurning(), 'it is still asking for frames').toBe(false);

		// And it went most of the way round to get there rather than stopping
		// where it stood: a landing, not a halt.
		expect(angleOf(mark)).toBeGreaterThan(caught + 90);
	});

	test('goes round once even when it is stopped in the same tick', async () => {
		/*
		 * The navigation that is over before it began — a desktop route change,
		 * and what the instance chooser does. The mark has not moved when the
		 * stop arrives, and the answer is not to rest where it stands: it
		 * carries on to the next upright, which from a standing start is one
		 * whole turn.
		 */
		startMarkSpin([mark], 0);
		const landed = stopMarkSpin();
		frames(20);
		expect(angleOf(mark), 'it rested without turning').toBeGreaterThan(0);

		/*
		 * A whole one, read frame by frame: resting takes the property off, so
		 * the finished mark is indistinguishable from one that never moved.
		 *
		 * The last painted angle is a few degrees short of 360 because the
		 * wind-down never slows to nothing — it crosses its resting place and
		 * stops there, upright. What matters is that the resting place was a
		 * whole turn away and not the nearest one.
		 */
		let furthest = 0;
		for (let i = 0; i < 200; i += 1) {
			frames(1);
			furthest = Math.max(furthest, angleOf(mark));
		}
		expect(furthest, 'it stopped short of a full turn').toBeGreaterThan(340);

		await expect(landed).resolves.toBeUndefined();
		expect(stillTurning(), 'it is still asking for frames').toBe(false);
	});
});
