import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two dark blocks say the same thing, or the default theme is wrong.
 *
 * Dark mode is one palette reached two ways: `html[data-theme='dark']`, for
 * somebody who chose it, and `html[data-theme='system']` inside a
 * `prefers-color-scheme` query, for everybody who did not — which is the
 * default, and therefore most people. A media query cannot be part of a
 * selector, so the two are a copy of each other, and a copy drifts.
 *
 * It did: the chosen-dark block redefined the red, blue, green, amber and
 * yellow ramps and the hover wash, and the system one redefined only the `-50`
 * fills. So the theme almost nobody selects was correct and the one almost
 * everybody gets drew error text in light-mode crimson on a dark ground.
 *
 * This compares the property *names* rather than the values, deliberately: a
 * value that differs between the two is a decision somebody could defend, and a
 * property present in one and missing from the other never is.
 */
const css = readFileSync(join(process.cwd(), 'src/routes/layout.css'), 'utf8');

/** The custom properties declared inside the block that starts at `from`. */
function declaredIn(from: number): Set<string> {
	let depth = 0;
	let opened = false;
	let end = css.length;

	for (let i = from; i < css.length; i += 1) {
		if (css[i] === '{') {
			depth += 1;
			opened = true;
		} else if (css[i] === '}') {
			depth -= 1;
			if (opened && depth <= 0) {
				end = i;
				break;
			}
		}
	}

	const names = new Set<string>();
	for (const match of css.slice(from, end).matchAll(/(--[a-z0-9-]+)\s*:/g)) names.add(match[1]);
	return names;
}

describe('the dark palette', () => {
	it('is declared identically for a chosen dark theme and for a dark system', () => {
		const chosen = css.indexOf("html[data-theme='dark'] {");
		const system = css.indexOf("html[data-theme='system'] {");
		expect(chosen, 'the chosen-dark block is not where it was').toBeGreaterThan(-1);
		expect(system, 'the system-dark block is not where it was').toBeGreaterThan(-1);

		const a = declaredIn(chosen);
		const b = declaredIn(system);

		const onlyChosen = [...a].filter((n) => !b.has(n)).sort();
		const onlySystem = [...b].filter((n) => !a.has(n)).sort();

		expect(
			onlyChosen,
			`the default theme never gets these in a dark OS: ${onlyChosen.join(', ')}`
		).toEqual([]);
		expect(
			onlySystem,
			`somebody who chose dark never gets these: ${onlySystem.join(', ')}`
		).toEqual([]);

		// And it is a real palette rather than two empty blocks agreeing.
		expect(a.size).toBeGreaterThan(50);
	});
});
