/**
 * The narrowest the shelf goes is one cover wide.
 *
 * The panel stopped at the general floor — a floor meant for a column of
 * somebody's own names — which on a grid of fixed-width covers left one cover
 * beside a band of space too narrow to hold a second, and no way to drag it in
 * any further.
 *
 * Two numbers in two files decide that: the cover's width and the shelf's
 * padding, both in the stylesheet, and the panel's own floor in the settings
 * service. Read from the files rather than restated here, because restating
 * them is the way they drift — a cover made wider would otherwise take the
 * band of empty space back and nothing would say so.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/routes/layout.css', 'utf8');
const settings = readFileSync('src/lib/services/settings.ts', 'utf8');

/** The `.notebook-shelf` rule, whatever else the stylesheet has grown. */
const shelf = /\.notebook-shelf\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

function rems(pattern: RegExp, from: string): number {
	const said = pattern.exec(from)?.[1];
	expect(said, `nothing matched ${pattern}`).toBeTruthy();
	return Number(said);
}

describe('the shelf of notebooks', () => {
	it('can be squeezed to exactly one cover and its padding', () => {
		const cover = rems(/repeat\(auto-fill,\s*([\d.]+)rem\)/, shelf);
		const padding = rems(/padding:\s*([\d.]+)rem/, shelf);
		const floor = rems(/NOTEBOOK_PANEL_MIN = ([\d.]+)/, settings);

		expect(floor).toBe(cover + padding * 2);
	});

	it('goes narrower than a panel of names may', () => {
		const floor = rems(/NOTEBOOK_PANEL_MIN = ([\d.]+)/, settings);
		const general = rems(/PANEL_WIDTH = \{ min: ([\d.]+)/, settings);

		expect(floor).toBeLessThan(general);
	});
});
