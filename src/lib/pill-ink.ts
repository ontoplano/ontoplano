/**
 * The ink that goes on a colour somebody chose.
 *
 * A pill is drawn in the colour of the thing it belongs to, and the words on
 * it have to be readable over every colour a person can pick — including the
 * ones nobody would. The browser was doing this on its own, in OKLCH: read the
 * pill's lightness, step to near-white below a threshold and near-black above
 * it. It is a lovely rule and it is not good enough, which is measurable:
 * across 30,780 colours it bottoms out at **2.4:1** and leaves 4,123 of them
 * under the 4.5:1 that small text wants. The worst are the vivid cyans and
 * greens around L 0.6, whose lightness reads middling while their luminance is
 * high — so they are given white ink on a bright field.
 *
 * Tuning that rule does not rescue it. The best a lightness step can do, swept
 * over every threshold and both extremes, is 3.36:1 with 1,077 still short.
 *
 * Choosing between black and white by **which one actually contrasts more**
 * bottoms out at 4.58:1 and leaves nothing under 4.5 — because it is not
 * guessing from a proxy, it is comparing the two candidates. That is what this
 * does, and it is why the answer is computed here rather than in the
 * stylesheet: CSS cannot compare, only threshold.
 *
 * `tests/pill-ink.test.ts` holds the numbers above to the floor.
 */

/**
 * Near-black, because a pill is a surface rather than a terminal — and black
 * behind it, because taste does not get to overrule legibility.
 *
 * The softer ink costs contrast: its own luminance is not zero, which drops
 * the floor from 4.5:1 to 4.13:1, and `#c34bb4` is one of the colours that
 * falls through the gap. So it is used while it clears the bar and plain black
 * takes over where it does not.
 */
export const PILL_INK_SOFT = '#111827';
export const PILL_INK_DARK = '#000000';
export const PILL_INK_LIGHT = '#ffffff';

/** What small text is expected to clear, and what this guarantees. */
export const PILL_INK_FLOOR = 4.5;

/** `#abc`, `#aabbcc`, or nothing we can read. */
function channels(hex: string): [number, number, number] | null {
	const said = hex.trim().replace(/^#/, '');
	const full =
		said.length === 3
			? said
					.split('')
					.map((c) => c + c)
					.join('')
			: said;
	if (!/^[0-9a-f]{6}$/i.test(full)) return null;
	return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as [
		number,
		number,
		number
	];
}

/** WCAG relative luminance, which is what "contrast" is actually measured on. */
function luminance([r, g, b]: [number, number, number]): number {
	const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(a: string, b: string): number {
	const one = channels(a);
	const two = channels(b);
	if (!one || !two) return 1;
	const [high, low] = [luminance(one), luminance(two)].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
}

/**
 * The readable ink for a fill, or null for a colour we cannot read.
 *
 * Null rather than a guess: a caller handed something that is not a hex colour
 * should fall back to the stylesheet's own rule, which at least draws
 * something, instead of being told black with confidence.
 */
export function pillInk(fill: string | null | undefined): string | null {
	if (!fill || !channels(fill)) return null;

	// The softer dark first, while it is readable. Black and white between them
	// cover every colour there is — their worst case is exactly 4.5:1 — so the
	// fallback cannot fail, and the preference never costs legibility.
	if (contrastRatio(fill, PILL_INK_SOFT) >= PILL_INK_FLOOR) return PILL_INK_SOFT;
	return contrastRatio(fill, PILL_INK_DARK) >= contrastRatio(fill, PILL_INK_LIGHT)
		? PILL_INK_DARK
		: PILL_INK_LIGHT;
}

/**
 * The inline style a pill wants: its colour, and the ink to write on it.
 *
 * One function because the two belong together — a `--pill` set without a
 * `--pill-ink` falls back to the old lightness step, which is the thing being
 * replaced, and it is exactly the kind of pairing somebody forgets on the
 * seventh screen.
 */
export function pillStyle(fill: string | null | undefined): string | undefined {
	if (!fill) return undefined;
	const ink = pillInk(fill);
	return ink ? `--pill:${fill};--pill-ink:${ink}` : `--pill:${fill}`;
}
