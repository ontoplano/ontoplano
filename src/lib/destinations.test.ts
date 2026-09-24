import { describe, expect, test } from 'vitest';
import { DESTINATIONS, findDestinations, matchScore } from './destinations';
import { ROOM_TABS } from './sections';
import { NAV_PLACES } from './sections-nav';
import { translatorFor } from './i18n/core';

const t = await translatorFor('en');
const pt = await translatorFor('pt-BR');

describe('matching what somebody types', () => {
	test('a prefix beats a match in the middle', () => {
		expect(matchScore('Board', 'bo')!).toBeGreaterThan(matchScore('Notebooks', 'bo')!);
	});

	test('scattered letters still match', () => {
		expect(matchScore('Planner To-do', 'pltd')).not.toBeNull();
	});

	test('letters in the wrong order do not', () => {
		expect(matchScore('Board', 'drab')).toBeNull();
	});

	test('an empty query keeps everything', () => {
		expect(findDestinations('', t)).toHaveLength(DESTINATIONS.length);
	});
});

describe('the list itself', () => {
	test('every destination has a label and a path', () => {
		for (const d of DESTINATIONS) {
			expect(d.label.length).toBeGreaterThan(0);
			expect(d.href.startsWith('/')).toBe(true);
		}
	});

	test('no two destinations share a path', () => {
		const paths = DESTINATIONS.map((d) => d.href);
		expect(new Set(paths).size).toBe(paths.length);
	});
});

describe('read off the rooms rather than written out', () => {
	test('every tab of every room is a place, so a new tab cannot be missing here', () => {
		const hrefs = new Set<string>(DESTINATIONS.map((d) => d.href));
		for (const place of NAV_PLACES) {
			const tabs = ROOM_TABS[place.key];
			if (tabs.length === 0) expect(hrefs.has(place.href)).toBe(true);
			for (const tab of tabs) expect(hrefs.has(tab.href), tab.href).toBe(true);
		}
	});

	test('matches the words on screen, not the catalogue keys', () => {
		expect(findDestinations('estoque', pt).map((d) => d.href)).toContain('/inventory/stock');
		expect(findDestinations('app.', t)).toHaveLength(0);
	});

	test('a tab put away takes its place with it, and so does its room', () => {
		expect(findDestinations('', t, ['recipes']).map((d) => d.href)).not.toContain(
			'/health/recipes'
		);
		expect(findDestinations('', t, ['health']).map((d) => d.href)).not.toContain(
			'/health/workouts'
		);
	});
});
