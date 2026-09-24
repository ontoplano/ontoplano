/**
 * Every glyph the navigation draws comes from one list.
 *
 * It did not. A room carried its own `icon:`, so did each tab of each room,
 * and so did each module a notebook can hold — three files for one picture,
 * and two of the writing room's tabs had simply never been given one, which
 * showed up as a gap rather than as a mistake. `$lib/glyphs` is the list now.
 *
 * What this holds: that the list covers everything that draws from it, that
 * every glyph in it is one the icon set actually has, and that a thing named
 * in two places — `goals` the room and `goals` the notebook tab — is one
 * entry rather than two that can drift.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { GLYPHS, glyphFor } from '../src/lib/glyphs';
import { NAV_PLACES, ROOMS } from '../src/lib/sections-nav';
import { ROOM_TABS, tabGlyph } from '../src/lib/sections';
import { NOTEBOOK_MODULES, moduleGlyph } from '../src/lib/notebook-modules';

/** The names `Icon` will actually draw, read off the component itself. */
const drawable = new Set(
	[
		...readFileSync('src/lib/components/Icon.svelte', 'utf8').matchAll(/^\t\t'?([a-z][\w-]*)'?:/gm)
	].map((found) => found[1])
);

describe('the one list of glyphs', () => {
	test('names only glyphs the icon set has', () => {
		expect(drawable.size, 'no icons were read off Icon.svelte').toBeGreaterThan(20);
		for (const [key, name] of Object.entries(GLYPHS))
			expect(drawable.has(name), `${key} wants "${name}", which Icon does not draw`).toBe(true);
	});

	test('covers every room of the bar', () => {
		for (const place of NAV_PLACES)
			expect(glyphFor(place.key), `${place.key} has no glyph`).toBeTruthy();
		// And the wheel draws the same ones, because it is built from these.
		for (const room of ROOMS) expect(room.icon).toBe(glyphFor(room.key));
	});

	/*
	 * The tabs are what started this: Diary and Weekly notes had no glyph at
	 * all, which nothing could have told you.
	 */
	test('covers every tab of every room', () => {
		for (const place of NAV_PLACES)
			for (const tab of ROOM_TABS[place.key])
				expect(tabGlyph(tab, place.key), `${tab.href} has no glyph`).toBeTruthy();
	});

	test('covers every module a notebook can hold', () => {
		for (const module of NOTEBOOK_MODULES)
			expect(moduleGlyph(module.id), `${module.id} has no glyph`).toBeTruthy();
	});

	/*
	 * One idea, one picture.
	 *
	 * A notebook's Goals tab and the Goals room are the same thing seen from
	 * two places. They share a key here, so they cannot be given two glyphs
	 * without somebody noticing — which is the whole point of the list.
	 */
	test('gives a thing named in two places the same glyph in both', () => {
		for (const module of NOTEBOOK_MODULES) {
			const room = NAV_PLACES.find((place) => place.key === (module.id as string));
			if (room) expect(moduleGlyph(module.id)).toBe(room.icon);
		}
	});

	test('a key it has never heard of gets nothing rather than a wrong picture', () => {
		expect(glyphFor('not-a-thing')).toBeUndefined();
		expect(glyphFor(undefined, 'not-a-thing', 'goals')).toBe(GLYPHS.goals);
	});
});
