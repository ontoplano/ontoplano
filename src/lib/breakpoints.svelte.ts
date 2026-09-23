import { PHONE_MEDIA } from './breakpoints.js';

/**
 * Whether this is a phone, as an answer that changes when the window does.
 *
 * `isPhone()` beside this reads the media query once, which is right for a
 * question asked at the moment of an action — does the back gesture own this
 * modal — and wrong for a component that has to *render* one thing on a phone
 * and another on a desktop. Rendering off a one-shot read gives a strip that is
 * correct until somebody resizes the window and then silently is not.
 *
 * Rendering off `hidden sm:flex` instead is the usual answer and does not work
 * here: the two shapes hold the same controls, and drawing both means two sets
 * of the same pickers in the DOM at once — two things with the same accessible
 * name, and a tab order that walks through the hidden copy.
 *
 * One listener per component that asks. `matchMedia` fires only when the answer
 * actually flips, so this is cheaper than a resize handler and does not need
 * throttling.
 */
export function phoneWidth(): { current: boolean } {
	let current = $state(false);

	$effect(() => {
		const query = window.matchMedia(PHONE_MEDIA);
		current = query.matches;

		const answer = (e: MediaQueryListEvent) => (current = e.matches);
		query.addEventListener('change', answer);
		return () => query.removeEventListener('change', answer);
	});

	return {
		get current() {
			return current;
		}
	};
}
