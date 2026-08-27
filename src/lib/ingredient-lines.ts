/**
 * Reading an ingredient list somebody pasted in.
 *
 * Every recipe on the internet is a list of lines, and typing them back in one
 * combobox at a time is the reason a recipe never gets written down. The
 * parsing is deliberately shallow: quantity, unit, name, and whatever came
 * after a comma is a note. It is right often enough to save the typing and
 * wrong in ways you can see and fix, which is the only honest target for
 * something guessing at prose.
 */

export type ParsedLine = {
	quantity: number | null;
	unit: string;
	name: string;
	note: string;
};

/** Units worth recognising: if it is not one of these, it is part of the name. */
const UNITS = [
	'g',
	'kg',
	'mg',
	'ml',
	'l',
	'cl',
	'dl',
	'tsp',
	'tbsp',
	'cup',
	'cups',
	'clove',
	'cloves',
	'slice',
	'slices',
	'pinch',
	'handful',
	'can',
	'cans',
	'tin',
	'tins',
	'pack',
	'packs',
	'bunch',
	'sprig',
	'sprigs',
	'oz',
	'lb'
];

/** The fractions recipes actually use, since "½ tsp" is common and 0.5 is not. */
const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125
};

function quantityFrom(token: string): number | null {
	if (FRACTIONS[token] !== undefined) return FRACTIONS[token];

	// "1/2" and "1 1/2" both turn up; the second arrives here as two tokens, so
	// the caller adds them.
	const ratio = token.match(/^(\d+)\/(\d+)$/);
	if (ratio) {
		const bottom = Number(ratio[2]);
		return bottom === 0 ? null : Number(ratio[1]) / bottom;
	}

	const plain = Number(token.replace(',', '.'));
	return Number.isFinite(plain) && token !== '' ? plain : null;
}

/**
 * One line into its parts.
 *
 * Returns null for a line with nothing in it and for the headings people paste
 * along with the list — "Ingredients", "For the sauce" — which have no quantity
 * and end in a colon.
 */
export function parseLine(raw: string): ParsedLine | null {
	// Bullets, dashes and checkbox syntax all mean "this is a list item".
	const line = raw
		.replace(/^\s*[-*•·]\s*/, '')
		.replace(/^\s*\[[ xX]?\]\s*/, '')
		.replace(/^\s*\d+[.)]\s+/, '')
		.trim();

	if (!line) return null;
	if (line.endsWith(':')) return null;

	// Anything after the first comma is how to prepare it, not what it is —
	// except a comma between two digits, which half the world uses for a decimal
	// point and which would otherwise turn "0,5 l milk" into half of nothing.
	const comma = line.search(/(?<!\d),|,(?!\d)/);
	const head = (comma === -1 ? line : line.slice(0, comma)).trim();
	const note = comma === -1 ? '' : line.slice(comma + 1).trim();

	const words = head.split(/\s+/);
	let quantity: number | null = null;
	let at = 0;

	const first = quantityFrom(words[0] ?? '');
	if (first !== null) {
		quantity = first;
		at = 1;

		// "1 1/2 cups" — a whole number followed by a fraction is one amount.
		const second = quantityFrom(words[1] ?? '');
		if (second !== null && second < 1 && Number.isInteger(first)) {
			quantity = first + second;
			at = 2;
		}
	}

	let unit = '';
	const maybe = (words[at] ?? '').toLowerCase().replace(/\.$/, '');
	if (UNITS.includes(maybe)) {
		unit = maybe;
		at += 1;
	}

	const name = words.slice(at).join(' ').trim();
	if (!name) return null;

	return { quantity, unit, name, note };
}

/** A pasted block into the lines worth adding. */
export function parseLines(text: string): ParsedLine[] {
	return String(text ?? '')
		.split(/\r?\n/)
		.map(parseLine)
		.filter((l): l is ParsedLine => l !== null);
}
