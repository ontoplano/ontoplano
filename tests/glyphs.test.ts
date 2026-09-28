/**
 * One thing, one glyph.
 *
 * Each place declares its glyph beside its route, and `$lib/glyphs` indexes
 * them. What this holds: every place has one, every one is a glyph `Icon`
 * draws, and no two different places share one — a room and its first tab
 * included. The only sharing allowed is a key that says it *is* another
 * (the Notebooks room is its Notebooks tab; a notebook's Bills tab is Bills),
 * and then the glyph is taken from there rather than written twice.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { GLYPH_THINGS, GLYPHS, glyphFor, moduleGlyph, routeGlyph } from '../src/lib/glyphs';
import { NAV_PLACES, ROOMS } from '../src/lib/sections-nav';
import { ROOM_TABS } from '../src/lib/sections';
import { NOTEBOOK_MODULES } from '../src/lib/notebook-modules';
import { SETTINGS_ROUTES } from '../src/lib/settings-tabs';
import { DESTINATIONS } from '../src/lib/destinations';
import { CAPTURES } from '../src/lib/capture';
import { KIND_PLACES, SEARCH_KINDS } from '../src/lib/search';

/** The names `Icon` will actually draw, read off the component itself. */
const drawable = new Set(
	[
		...readFileSync('src/lib/components/Icon.svelte', 'utf8').matchAll(/^\t\t'?([a-z][\w-]*)'?:/gm)
	].map((found) => found[1])
);

/** Follow `is` to the thing a key stands for. */
function canonical(key: string): string {
	const seen = new Set<string>();
	let at = key;
	for (;;) {
		const thing = GLYPH_THINGS.find((one) => one.key === at);
		if (!thing?.is || seen.has(at)) return at;
		seen.add(at);
		at = thing.is;
	}
}

describe('the glyphs', () => {
	test('are all ones the icon set draws', () => {
		expect(drawable.size, 'no icons were read off Icon.svelte').toBeGreaterThan(20);
		for (const thing of GLYPH_THINGS)
			expect(drawable.has(thing.glyph), `${thing.key} wants "${thing.glyph}"`).toBe(true);
	});

	test('are one per thing: no two different places share one', () => {
		const owners = new Map<string, Set<string>>();
		for (const thing of GLYPH_THINGS)
			owners.set(thing.glyph, (owners.get(thing.glyph) ?? new Set()).add(canonical(thing.key)));
		const shared = [...owners]
			.filter(([, keys]) => keys.size > 1)
			.map(([glyph, keys]) => `${glyph}: ${[...keys].join(', ')}`);
		expect(shared).toEqual([]);
	});

	test('a key that is another thing wears exactly that thing’s glyph', () => {
		for (const thing of GLYPH_THINGS)
			if (thing.is) {
				expect(GLYPHS[thing.is], `${thing.key} is ${thing.is}, unknown`).toBeTruthy();
				expect(thing.glyph).toBe(GLYPHS[thing.is]);
			}
	});

	test('keys are unique', () => {
		const keys = GLYPH_THINGS.map((thing) => thing.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('every place has one', () => {
	test('every room of the bar, drawn the same by the wheel', () => {
		for (const place of NAV_PLACES) expect(glyphFor(place.key), place.key).toBeTruthy();
		for (const room of ROOMS) expect(room.icon).toBe(glyphFor(room.key));
	});

	test('every tab of every room, and no room wears its first tab’s unless it is it', () => {
		for (const place of NAV_PLACES) {
			for (const tab of ROOM_TABS[place.key]) expect(routeGlyph(tab.href), tab.href).toBeTruthy();
			const first = ROOM_TABS[place.key][0];
			if (first && place.is !== first.href)
				expect(place.icon, `${place.key} wears ${first.href}'s glyph`).not.toBe(first.glyph);
		}
	});

	test('every settings page, and home and search', () => {
		for (const href of Object.keys(SETTINGS_ROUTES)) expect(routeGlyph(href), href).toBeTruthy();
		expect(routeGlyph('/')).toBe('home');
		expect(routeGlyph('/search')).toBe('search');
	});

	test('every module a notebook can hold', () => {
		for (const module of NOTEBOOK_MODULES) expect(moduleGlyph(module.id), module.id).toBeTruthy();
	});

	test('every search kind', () => {
		for (const kind of SEARCH_KINDS)
			expect(glyphFor(KIND_PLACES[kind]), `${kind} → ${KIND_PLACES[kind]}`).toBeTruthy();
	});
});

describe('the lists that draw them read them', () => {
	test('the palette wears each destination’s own glyph', () => {
		for (const d of DESTINATIONS) expect(d.icon, d.href).toBe(routeGlyph(d.href) ?? d.icon);
		for (const place of NAV_PLACES)
			for (const tab of ROOM_TABS[place.key])
				expect(DESTINATIONS.find((d) => d.href === tab.href)?.icon).toBe(tab.glyph);
	});

	test('a capture wears the glyph of where it lands', () => {
		for (const capture of CAPTURES) expect(capture.icon).toBe(routeGlyph(capture.room));
	});

	test('a notebook tab wears the glyph of the room or page it shows', () => {
		expect(moduleGlyph('habits')).toBe(routeGlyph('/health/habits'));
		expect(moduleGlyph('bills')).toBe(routeGlyph('/finance/bills'));
		expect(moduleGlyph('goals')).toBe(glyphFor('goals'));
		expect(moduleGlyph('tasks')).toBe(routeGlyph('/tasks/todo'));
	});

	test('a key it has never heard of gets nothing rather than a wrong picture', () => {
		expect(glyphFor('not-a-thing')).toBeUndefined();
		expect(glyphFor(undefined, 'not-a-thing', 'goals')).toBe(GLYPHS.goals);
	});
});
