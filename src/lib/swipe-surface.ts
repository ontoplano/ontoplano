import { getContext, setContext } from 'svelte';

/**
 * The one element a swipe is listened for on: the whole scrolling screen.
 *
 * A swipe that changes tab has to work anywhere, including the empty half of a
 * short page — which is exactly the part the room's own content does not
 * cover. So the shell offers its scroller and whoever knows what a swipe means
 * here (`TabbedRoom`) listens on that instead of on its own box.
 */
const SURFACE = Symbol('swipe-surface');

export function provideSwipeSurface(get: () => HTMLElement | undefined): void {
	setContext(SURFACE, get);
}

export function swipeSurface(): (() => HTMLElement | undefined) | undefined {
	return getContext<(() => HTMLElement | undefined) | undefined>(SURFACE);
}
