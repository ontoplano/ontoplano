import { describe, expect, it } from 'vitest';
import { NAV_PLACES, ROOMS, roomFor } from './sections-nav';
import { HIDEABLE_SECTIONS } from './sections';

/**
 * The bar and the pie show the same places.
 *
 * They did not. The bar was built from a list in `+layout.svelte` with ten
 * entries and the pie from one in `sections-nav.ts` with eight, so **Notebooks
 * and People were in the bar and absent from the pie**, whatever the
 * preferences said — and no preference could bring them back, because the pie
 * had never heard of them.
 *
 * There is one list now, and this is what keeps it one: a place added to the
 * navigation appears in both renderings or the suite fails.
 */
describe('the places the app can take you', () => {
	it('gives the pie every place the bar has', () => {
		expect(ROOMS.map((r) => r.key)).toEqual(NAV_PLACES.map((p) => p.key));
	});

	it('has People among them, and deliberately not Notebooks', () => {
		// People went missing once because nothing said it had to be here.
		// Notebooks is the opposite case: it is the second tab of Notes, not a
		// room — an entry of its own would put the same shelf in the bar twice.
		expect(roomFor('people'), 'people is not a place the pie can reach').toBeTruthy();
		expect(roomFor('notebooks')).toBeUndefined();
	});

	it('sends every place somewhere, once', () => {
		const hrefs = NAV_PLACES.map((p) => p.href);
		expect(new Set(hrefs).size).toBe(hrefs.length);
		for (const place of NAV_PLACES) expect(place.href.startsWith('/')).toBe(true);
	});

	it('only names preferences that exist', () => {
		const known = new Set(HIDEABLE_SECTIONS.map((s) => s.id));
		for (const place of NAV_PLACES) {
			if (place.hide) {
				expect(known.has(place.hide), `${place.key} hides behind an unknown "${place.hide}"`).toBe(
					true
				);
			}
		}
	});

	it('has no Home among them — the wordmark is the way back', () => {
		// It was here, and a stored order that predated it pushed it to the far
		// end of the bar: the way home, last, beside the wordmark that already
		// went there. The header logo and the phone bar's house are the door.
		expect(NAV_PLACES.find((p) => p.key === 'home')).toBeUndefined();
	});
});
