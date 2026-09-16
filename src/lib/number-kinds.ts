/**
 * A number you count, and a number you measure.
 *
 * Twelve books and 21.1 kilometres are both numbers, and the difference is not
 * cosmetic: a thing you count is finished one at a time, so it gets a plus and
 * a minus; a thing you measure is typed, because 14.6 is not two presses away
 * from anything.
 *
 * Written with the set symbols rather than the words. ℤ and ℚ are what these
 * two things are actually called, they are the same in every language the app
 * might be read in, and they fit in a control the width of a letter — which
 * "whole number" and "decimal" do not.
 */
export const NUMBER_KINDS = [
	{ whole: true, symbol: 'ℤ', label: 'app.wholeNumbersCountedWith' },
	{ whole: false, symbol: 'ℚ', label: 'app.fractionsMeasuredTypedIn' }
] as const;

/** The symbol for one of them, for a control that shows the current choice. */
export function numberSymbol(whole: boolean): string {
	return whole ? 'ℤ' : 'ℚ';
}

/**
 * How much one press of a stepper moves a counted number.
 *
 * One. A goal counted in anything other than ones is a goal measured, and it
 * should say so by being the other kind.
 */
export const COUNT_STEP = 1;
