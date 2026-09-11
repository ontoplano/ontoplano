/**
 * Where the app stops being a phone.
 *
 * Tailwind's `sm`, written down once for the script side: the stylesheets say
 * `sm:` and get this number from Tailwind, but a component that has to *ask*
 * — is the modal a screen right now, does the back gesture own it — needs the
 * same answer in JavaScript, and two hardcoded 640s drift.
 */
export const PHONE_BREAKPOINT = 640;

/** The media query for "this is a phone", matching the CSS `max-sm` side. */
export const PHONE_MEDIA = `(max-width: ${PHONE_BREAKPOINT - 1}px)`;

/** Whether the viewport is a phone right now. False during SSR. */
export function isPhone(): boolean {
	return typeof window !== 'undefined' && window.matchMedia(PHONE_MEDIA).matches;
}
