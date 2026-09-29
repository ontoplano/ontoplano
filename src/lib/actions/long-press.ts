/**
 * A finger held on something, as its own gesture.
 *
 * A phone has no pointer to hover with, so whatever a desktop puts behind a
 * small button that appears on hover — the × on a label — has to be reachable
 * another way, and holding the thing is the one people already try. Touch and
 * pen only: a mouse has the button.
 *
 * The press that follows a hold is swallowed, so holding a label does not also
 * do what tapping it does; and the browser's own long-press menu is kept away
 * from something that now means something else.
 */
import type { Action } from 'svelte/action';

/** How long a finger has to stay down before it counts as held. */
export const LONG_PRESS_MS = 500;

/** How far a finger may drift before it is a scroll rather than a hold. */
const DRIFT_PX = 10;

export const longPress: Action<HTMLElement, ((node: HTMLElement) => void) | undefined> = (
	node,
	initial
) => {
	let onhold = initial;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let start = { x: 0, y: 0 };
	let held = false;
	/** Whether the last press was a finger or a pen, which a context menu does not say. */
	let touched = false;

	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	const down = (event: PointerEvent) => {
		touched = event.pointerType !== 'mouse';
		if (!onhold || !touched) return;
		held = false;
		start = { x: event.clientX, y: event.clientY };
		cancel();
		timer = setTimeout(() => {
			timer = undefined;
			held = true;
			onhold?.(node);
		}, LONG_PRESS_MS);
	};

	const move = (event: PointerEvent) => {
		if (!timer) return;
		if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRIFT_PX) cancel();
	};

	// The tap a hold ends in is not a tap.
	const click = (event: MouseEvent) => {
		if (!held) return;
		held = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	};

	/*
	 * The browser may take a still finger for its own long press — a
	 * `pointercancel`, then a context menu — at about the moment the timer
	 * would have gone. That menu is the hold, then, rather than something to
	 * race.
	 */
	const menu = (event: Event) => {
		if (!onhold || !touched) return;
		event.preventDefault();
		if (held) return;
		cancel();
		held = true;
		onhold(node);
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('click', click, true);
	node.addEventListener('contextmenu', menu);

	return {
		update(next) {
			onhold = next;
		},
		destroy() {
			cancel();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('click', click, true);
			node.removeEventListener('contextmenu', menu);
		}
	};
};
