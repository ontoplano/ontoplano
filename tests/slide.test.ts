/**
 * @vitest-environment happy-dom
 */
/**
 * The screen leaves the moment it is asked to.
 *
 * The part that is hard to see in a browser and easy to get wrong: a copy of
 * the outgoing screen is what travels, and the original has to go out of sight
 * while it does. Left on view, the copy slides off over something identical
 * that has not moved — so nothing appears to happen until the new page arrives
 * and slides in, which reads as the whole movement waiting for the load.
 *
 * Driven here rather than end-to-end because a navigation on a local server is
 * over before the eye could tell the two apart, and because "hidden until the
 * next screen arrives" has to hold for the navigation that never arrives too.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { slideAway, slideOn, stopHiding } from '../src/lib/slide';

let frame: HTMLElement;
let pane: HTMLElement;
let stage: HTMLElement;

beforeEach(() => {
	document.body.innerHTML = `
		<div class="slide-frame">
			<div id="pane">the screen</div>
			<div id="stage" class="slide-stage"></div>
		</div>`;
	frame = document.querySelector('.slide-frame')!;
	pane = document.getElementById('pane')!;
	stage = document.getElementById('stage')!;

	// happy-dom has no Web Animations API; the movement itself is the browser's
	// business, and what is checked here is what it leaves behind.
	Object.defineProperty(HTMLElement.prototype, 'animate', {
		configurable: true,
		writable: true,
		value: () => ({ addEventListener: () => undefined })
	});
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('a screen on its way out', () => {
	test('goes out of sight, and a copy of it is what travels', () => {
		slideAway(stage, pane, 1);

		expect(pane.style.visibility).toBe('hidden');
		expect(stage.children).toHaveLength(1);
		expect(stage.children[0].textContent).toBe('the screen');
		// The copy is not read out twice, and cannot be pressed.
		expect(stage.children[0].getAttribute('aria-hidden')).toBe('true');
		expect((stage.children[0] as HTMLElement).style.pointerEvents).toBe('none');
	});

	test('comes back into sight when the next screen arrives', () => {
		slideAway(stage, pane, 1);
		slideOn(pane, 1);

		expect(pane.style.visibility).toBe('');
	});

	/**
	 * A navigation can be abandoned or superseded, and then the arrival never
	 * happens. Nothing in here may leave the app looking at an empty page.
	 */
	test('comes back into sight even when nothing arrives', () => {
		slideAway(stage, pane, 1);
		stopHiding(pane);

		expect(pane.style.visibility).toBe('');
	});

	test('the arc turns about a point below the screen, the straight one does not', () => {
		slideAway(stage, pane, 1, true);
		expect((stage.children[0] as HTMLElement).style.transformOrigin).toMatch(/^50% \d/);

		stage.innerHTML = '';
		slideAway(stage, pane, 1, false);
		expect((stage.children[0] as HTMLElement).style.transformOrigin).toBe('');
	});

	test('nothing is left in the frame that was not there before', () => {
		slideAway(stage, pane, 1);
		// The copy lives in the stage, which is the framework's own empty box —
		// never among the nodes it places by their neighbours.
		expect(frame.children).toHaveLength(2);
	});
});
