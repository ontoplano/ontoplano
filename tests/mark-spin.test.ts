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
	test('starts painting at once, rather than after the delay', () => {
		startMarkSpin([mark], 0, true);
		frames(4);
		expect(angleOf(mark), 'nothing was drawn').toBeGreaterThan(0);
	});

	test('and without `atOnce` it waits, so a quick wait leaves no trace', () => {
		startMarkSpin([mark]);
		frames(4);
		expect(angleOf(mark)).toBe(0);
	});
});

describe('a turn nobody has stopped', () => {
	test('keeps going past a full revolution, for as long as the wait lasts', () => {
		startMarkSpin([mark], 0, true);
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
		startMarkSpin([mark], 0, true);
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

	test('does not take the shortcut meant for a wait that never showed', async () => {
		/*
		 * Start and stop in the same tick — what the chooser does. Before, the
		 * angle was zero (no frame had run), the shortcut read that as "nothing
		 * was drawn" and rested immediately, and the mark never moved.
		 */
		startMarkSpin([mark], 0, true);
		const landed = stopMarkSpin();
		frames(20);
		expect(angleOf(mark), 'it rested without turning').toBeGreaterThan(0);

		frames(200);
		await expect(landed).resolves.toBeUndefined();
		expect(stillTurning(), 'it is still asking for frames').toBe(false);
	});
});
