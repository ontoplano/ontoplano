import { describe, expect, test } from 'vitest';
import { zoneGroups, zoneLabel } from '../src/lib/timezones';

/**
 * The list behind the timezone picker.
 *
 * It was an `<input>` in both places that ask, wanting `America/Sao_Paulo`
 * typed by hand — get one letter wrong and every date in the app is a day out
 * with nothing on screen to say why.
 *
 * What has to hold: every zone the platform knows is offerable, each one reads
 * as a place and an offset somebody can check against their own clock, and the
 * value stored is still the IANA name, because that is the thing that survives
 * the clocks changing.
 */

describe('the zones offered', () => {
	const groups = zoneGroups(new Date('2026-09-03T12:00:00Z'));
	const all = groups.flatMap((g) => g.zones);

	test('all of them, under a heading that is an offset', () => {
		expect(all.length).toBeGreaterThan(300);
		expect(groups.map((g) => g.label)).toEqual(expect.arrayContaining(['GMT−3', 'GMT+1']));
	});

	test('UTC is offerable, whatever the platform lists', () => {
		// Not in `supportedValuesOf` on every runtime, and it is what a server is
		// set to — a picker that cannot offer it is one somebody works around.
		expect(all.map((z) => z.id)).toContain('UTC');
	});

	test('the value is the IANA name, which is what gets stored', () => {
		const sp = all.find((z) => z.id === 'America/Sao_Paulo');
		expect(sp).toBeDefined();
		expect(sp!.city).toBe('Sao Paulo');
	});

	test('a name with a country in the middle keeps only the city', () => {
		// `America/Argentina/Rio_Gallegos` is three segments; the city is the
		// last one and the group is the first, or every one of these lands in a
		// group called "Argentina" that a Brazilian would not look in.
		const deep = all.find((z) => z.id.split('/').length > 2);
		expect(deep, 'no multi-segment zone in the list at all').toBeDefined();
		expect(deep!.city).toBe(deep!.id.split('/').at(-1)!.replaceAll('_', ' '));
		expect(deep!.region).toBe(deep!.id.split('/')[0]);
	});

	test('each reads as a place, with the part of the world that settles it', () => {
		const sp = all.find((z) => z.id === 'America/Sao_Paulo')!;
		expect(zoneLabel(sp)).toBe('Sao Paulo · America');
		// The offset is the heading above it, not four hundred repetitions.
		expect(zoneLabel(sp)).not.toContain('GMT');
	});

	test('and the heading is a real minus sign, not a hyphen', () => {
		// Beside a number a hyphen reads as one.
		const west = groups.find((g) => g.zones.some((z) => z.id === 'America/Sao_Paulo'))!;
		expect(west.label).toBe('GMT−3');
		expect(west.label).not.toContain('GMT-');
	});

	test('the offset is the one in force, not a fixed one', () => {
		const ny = 'America/New_York';
		const summer = zoneGroups(new Date('2026-07-01T12:00:00Z'))
			.flatMap((g) => g.zones)
			.find((z) => z.id === ny)!;
		const winter = zoneGroups(new Date('2026-01-01T12:00:00Z'))
			.flatMap((g) => g.zones)
			.find((z) => z.id === ny)!;

		expect(summer.offset).toBe('GMT−4');
		expect(winter.offset).toBe('GMT−5');
	});

	/**
	 * The whole point of the shape. Grouped by continent, finding São Paulo
	 * meant knowing it is filed under America and scrolling past Argentina;
	 * the thing somebody actually knows is roughly what their offset is.
	 */
	test('the groups run west to east, in one order', () => {
		const minutes = groups.map((g) => g.zones[0].minutes);
		expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
		// And they really are one offset each, or the heading lies.
		for (const group of groups) {
			expect(new Set(group.zones.map((z) => z.minutes)).size).toBe(1);
		}
	});

	test('the cities inside one offset are alphabetical', () => {
		const group = groups.find((g) => g.zones.length > 5)!;
		const cities = group.zones.map((z) => z.city);
		expect(cities).toEqual([...cities].sort((a, b) => a.localeCompare(b)));
	});

	test('a zone belongs to exactly one group', () => {
		expect(new Set(all.map((z) => z.id)).size).toBe(all.length);
	});
});
