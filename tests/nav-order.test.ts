/**
 * The menu, in somebody's own order and colours.
 *
 * The two rules that matter are both about time passing. A room this app no
 * longer has must not leave a hole in a menu somebody arranged a year ago; and
 * a room this app has just gained must appear for them anyway, or the feature
 * ships to everybody except the people who cared enough to arrange their menu.
 */
import { describe, expect, test } from 'vitest';
import { SECTIONS } from '../src/lib/colors';
import { accentsWith, applyOrder, isHexColor, placesFor } from '../src/lib/nav-order';
import { NAV_PLACES } from '../src/lib/sections-nav';

const keys = (list: { key: string }[]) => list.map((p) => p.key);

describe('the order', () => {
	test('is the default when nobody has chosen one', () => {
		expect(keys(applyOrder(NAV_PLACES, []))).toEqual(keys(NAV_PLACES));
	});

	test('puts the named rooms first, in the order they were named', () => {
		const out = applyOrder(NAV_PLACES, ['inventory', 'ideas']);
		expect(keys(out).slice(0, 2)).toEqual(['inventory', 'ideas']);
	});

	test('drops a key for a room that no longer exists', () => {
		const out = applyOrder(NAV_PLACES, ['beliefs', 'ideas']);
		expect(keys(out)).not.toContain('beliefs');
		expect(keys(out)[0]).toBe('ideas');
		expect(out).toHaveLength(NAV_PLACES.length);
	});

	test('and keeps a room the stored order has never heard of', () => {
		// The case that matters: somebody arranged their menu, and then the app
		// grew a room. It has to turn up for them too.
		const out = applyOrder(NAV_PLACES, ['home', 'planner']);
		expect(keys(out)).toContain('inventory');
		expect(out).toHaveLength(NAV_PLACES.length);
	});

	test('never loses or duplicates a room, whatever it is given', () => {
		const nonsense = ['ideas', 'ideas', 'nope', '', 'home'];
		const out = applyOrder(NAV_PLACES, nonsense);
		expect(out).toHaveLength(NAV_PLACES.length);
		expect(new Set(keys(out)).size).toBe(NAV_PLACES.length);
	});
});

describe('the colours', () => {
	test('are the app’s until somebody changes one', () => {
		expect(accentsWith(null).planner).toBe(SECTIONS.planner.accent);
	});

	test('take a hex triple for a section that exists', () => {
		expect(accentsWith({ planner: '#123456' }).planner).toBe('#123456');
	});

	test('ignore anything that is not one', () => {
		// A colour goes straight into a `style` attribute, so what is stored has
		// to be checked on the way out and not only on the way in.
		for (const bad of ['red', '#abc', 'javascript:alert(1)', '#12345g', '']) {
			expect(accentsWith({ planner: bad }).planner).toBe(SECTIONS.planner.accent);
		}
	});

	test('and ignore a section that does not exist', () => {
		const out = accentsWith({ beliefs: '#123456' }) as Record<string, string>;
		expect(out.beliefs).toBeUndefined();
	});

	test('isHexColor is the one gate', () => {
		expect(isHexColor('#0f766e')).toBe(true);
		expect(isHexColor('#0F766E')).toBe(true);
		expect(isHexColor('0f766e')).toBe(false);
		expect(isHexColor(null)).toBe(false);
	});
});

describe('what the shell renders', () => {
	test('is the order and the colours together, one call', () => {
		const out = placesFor(NAV_PLACES, { order: ['ideas'], colors: { ideas: '#010203' } });
		expect(out[0].key).toBe('ideas');
		expect(out[0].accent).toBe('#010203');
	});
});
