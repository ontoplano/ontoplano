/**
 * @vitest-environment happy-dom
 */
/**
 * The dissolve moves the threshold, frame by frame.
 *
 * This is the part `e2e/page-turn.e2e.ts` cannot see. A headless browser hands
 * out animation frames when it feels like compositing, and against a dev
 * server on the same machine a navigation can land inside one frame — so the
 * end-to-end test can only honestly say that the filter goes on when the
 * navigation starts and comes off when it lands.
 *
 * Whether the threshold actually slides is a question about a loop, and a loop
 * is answered by driving it: `requestAnimationFrame` and the clock are both
 * stood in for here, so "one frame later" is something the test decides.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PAGE_TURN_DEFAULTS as PAGE_TURN } from '../src/lib/page-turn';

/** Frames waiting to run, and the clock they will be told about. */
let pending: FrameRequestCallback[] = [];
let clock = 0;

/** Run one frame, `ms` after the last. */
function tick(ms: number) {
	clock += ms;
	const due = pending;
	pending = [];
	for (const frame of due) frame(clock);
}

function intercept(): number {
	return Number(document.getElementById(`${PAGE_TURN.outFilter}-ramp`)!.getAttribute('intercept'));
}

let page: HTMLElement;
let turnOut: (page: HTMLElement | undefined) => void;
let turnIn: (page: HTMLElement | undefined) => void;

beforeEach(async () => {
	vi.useFakeTimers();
	pending = [];
	clock = 0;
	window.requestAnimationFrame = ((frame: FrameRequestCallback) => {
		pending.push(frame);
		return pending.length;
	}) as typeof window.requestAnimationFrame;
	window.performance.now = () => clock;
	// Nobody in this test has asked for less motion.
	window.matchMedia = ((query: string) => ({ matches: false, media: query })) as never;

	document.body.innerHTML = `
		<svg><filter><feComponentTransfer><feFunc id="${PAGE_TURN.outFilter}-ramp" intercept="1"
		/></feComponentTransfer></filter></svg>
		<div class="page-turning"></div>`;
	page = document.querySelector('.page-turning')!;

	// Fresh each time: the module remembers where the last turn got to, which
	// is the point of it and would leak between these cases.
	vi.resetModules();
	const mod = await import('../src/lib/page-turn.svelte');
	turnOut = mod.turnOut;
	turnIn = mod.turnIn;
});

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

describe('turning the page', () => {
	test('breaking up slides the threshold the whole way', () => {
		turnOut(page);

		// The filter is on from the first frame — this is the half that covers
		// the wait, so it cannot arrive after it.
		expect(page.style.filter).toContain(PAGE_TURN.outFilter);
		expect(intercept()).toBe(1);

		const half = PAGE_TURN.durationMs / 2;
		tick(half / 4);
		const quarter = intercept();
		expect(quarter).toBeLessThan(1);

		tick(half / 4);
		expect(intercept()).toBeLessThan(quarter);

		tick(half);
		// Fully gone: the threshold has passed every dot on the screen.
		expect(intercept()).toBe(1 - PAGE_TURN.hardness);
	});

	/**
	 * A page that arrives at once still gets a turn.
	 *
	 * This is what every navigation on localhost looked like: the data comes
	 * back inside a frame, `turnIn` runs before `turnOut`'s loop has ticked
	 * once, and the threshold reads 1 from the first frame to the last. The
	 * filter goes on, nothing dissolves, the filter comes off. The second half
	 * waits for the first now, so there is always something to see.
	 */
	test('an instant navigation still dissolves, and does not lag behind it', () => {
		turnOut(page);
		expect(intercept()).toBe(1);

		// Landed before a single frame of the outgoing half has run.
		turnIn(page);

		/*
		 * Straight to gone, on the first frame. Not after a wait: the content
		 * has already been swapped by the time this is called, so anything the
		 * outgoing half did from here would be breaking up the page that just
		 * arrived — the turn playing after the navigation instead of over it.
		 */
		tick(0);
		expect(intercept()).toBe(1 - PAGE_TURN.hardness);

		const seen: number[] = [];
		for (let i = 0; i < 20; i++) {
			tick(PAGE_TURN.durationMs / 20);
			seen.push(intercept());
		}

		// And it comes up out of the dots, one way, never back down.
		for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
		expect(intercept()).toBe(1);
		expect(page.style.filter).toBe('');
	});

	/**
	 * And coming back starts from wherever going away got to.
	 *
	 * A navigation that lands in thirty milliseconds leaves the page a quarter
	 * erased. An incoming ramp that begins at "fully gone" jumps it there for
	 * one frame, which is a flick rather than ink — and that is exactly what a
	 * change of room looked like on a fast machine.
	 */
	test('arriving picks up where breaking up stopped', () => {
		turnOut(page);
		// The whole of the first half, so there is nothing to make up.
		tick(PAGE_TURN.durationMs / 2);
		const caught = intercept();
		expect(caught).toBe(1 - PAGE_TURN.hardness);

		turnIn(page);
		// No jump on the first frame of the second half.
		tick(0);
		expect(intercept()).toBeCloseTo(caught, 5);

		tick(PAGE_TURN.durationMs);
		expect(intercept()).toBe(1);
		// Nothing is filtered while nothing is turning.
		expect(page.style.filter).toBe('');
	});

	test('a second navigation replaces the first rather than racing it', () => {
		turnOut(page);
		tick(PAGE_TURN.durationMs / 8);
		turnOut(page);
		const frames = pending.length;
		tick(16);
		// One loop, not two: the abandoned one does not go on writing.
		expect(pending.length).toBeLessThanOrEqual(frames);
	});
});
