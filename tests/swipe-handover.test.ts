/**
 * @vitest-environment happy-dom
 */
/**
 * A sideways drag does one thing, not two.
 *
 * The room's tabs live in a strip that scrolls when they do not all fit, and
 * the ordinary way to reach the last one is to drag the strip along until it
 * appears. That drag ends with the strip against its end — which is exactly
 * the state the swipe used to read as "this scroller is finished, the gesture
 * is mine", so reaching for the last tab also moved the page to the next one.
 *
 * The rule now: a scroller the finger actually moved keeps the whole gesture.
 * A strip that was already at its end when the finger landed moved nowhere, so
 * swiping across it still goes to the next section — which is the behaviour
 * the handover exists for.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { onSwipe } from '../src/lib/swipe';

/** A strip of tabs that is wider than the room it has. */
function strip(at: number, { width = 200, content = 600 } = {}) {
	const surface = document.createElement('div');
	const tabs = document.createElement('nav');
	tabs.style.overflowX = 'auto';
	surface.append(tabs);
	document.body.append(surface);

	Object.defineProperty(tabs, 'clientWidth', { value: width, configurable: true });
	Object.defineProperty(tabs, 'scrollWidth', { value: content, configurable: true });
	tabs.scrollLeft = at;

	return { surface, tabs };
}

/** One finger, down and up, with whatever the strip did in between. */
function drag(
	tabs: HTMLElement,
	{ dx, dy = 0, scrollsTo }: { dx: number; dy?: number; scrollsTo?: number }
) {
	const start = { clientX: 300, clientY: 400 };
	const down = new Event('touchstart', { bubbles: true });
	Object.assign(down, { touches: [start], changedTouches: [start] });
	tabs.dispatchEvent(down);

	// What the browser itself does to the strip while the finger moves.
	if (scrollsTo !== undefined) tabs.scrollLeft = scrollsTo;

	const end = { clientX: start.clientX + dx, clientY: start.clientY + dy };
	const up = new Event('touchend', { bubbles: true });
	Object.assign(up, { touches: [], changedTouches: [end] });
	tabs.dispatchEvent(up);
}

let next: ReturnType<typeof vi.fn>;
let back: ReturnType<typeof vi.fn>;

beforeEach(() => {
	document.body.innerHTML = '';
	next = vi.fn();
	back = vi.fn();
});

describe('a drag that scrolled the tab strip', () => {
	test('does not also change tab, even when it ends against the end', () => {
		// 400 is the last scrollable pixel here: the drag reaches the end of
		// the strip, which is what happens every time somebody goes for a tab
		// that was off screen.
		const { surface, tabs } = strip(0);
		onSwipe(surface, { next, back });

		drag(tabs, { dx: -160, scrollsTo: 400 });

		expect(next).not.toHaveBeenCalled();
		expect(back).not.toHaveBeenCalled();
	});

	test('nor when it stops with room to spare', () => {
		const { surface, tabs } = strip(0);
		onSwipe(surface, { next, back });

		drag(tabs, { dx: -160, scrollsTo: 120 });

		expect(next).not.toHaveBeenCalled();
	});
});

describe('a drag across a strip that could not move', () => {
	test('goes on to the next section', () => {
		// Already at its end when the finger landed, and it stays there.
		const { surface, tabs } = strip(400);
		onSwipe(surface, { next, back });

		drag(tabs, { dx: -160 });

		expect(next).toHaveBeenCalledTimes(1);
	});

	test('and back, from a strip already at its start', () => {
		const { surface, tabs } = strip(0);
		onSwipe(surface, { next, back });

		drag(tabs, { dx: 160 });

		expect(back).toHaveBeenCalledTimes(1);
	});
});

describe('what was always true stays true', () => {
	test('a swipe over the page itself still changes tab', () => {
		const surface = document.createElement('div');
		const card = document.createElement('div');
		surface.append(card);
		document.body.append(surface);
		onSwipe(surface, { next, back });

		drag(card, { dx: -160 });

		expect(next).toHaveBeenCalledTimes(1);
	});

	test('a diagonal gesture is a scroll, not a swipe', () => {
		const surface = document.createElement('div');
		const card = document.createElement('div');
		surface.append(card);
		document.body.append(surface);
		onSwipe(surface, { next, back });

		drag(card, { dx: -160, dy: -300 });

		expect(next).not.toHaveBeenCalled();
	});
});
