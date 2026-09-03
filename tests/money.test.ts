import { describe, expect, test } from 'vitest';
import {
	allCurrencies,
	CURRENCIES,
	formatMoney,
	isCurrency,
	normaliseCurrency,
	parseMoney
} from '../src/lib/money';

/**
 * Money, once it stopped being eight currencies.
 *
 * The shortlist used to be the whole of what the app would take, so anybody
 * paid in zloty or rand could not record what they spend. Opening it up moved
 * two things from "true of eight currencies" to "has to be asked":
 *
 * **What counts as one.** The first answer was "whatever `Intl.NumberFormat`
 * will format", which is wrong in the way that matters: it formats *any* three
 * letters, printing the code where the symbol goes. `ZZZ` passed, so a typo
 * became a shopping list quoted in nothing at all, with no complaint anywhere.
 *
 * **How many minor units make one.** It was "a hundred, unless it is yen".
 * That is right for eight currencies and wrong for a lot of the rest — won,
 * dong and króna have no minor unit, dinar has a thousand — and a price stored
 * a hundred times too small is not a rounding error.
 */

describe('what counts as a currency', () => {
	test('the shortlist, and everything else that is real', () => {
		for (const code of CURRENCIES) expect(isCurrency(code)).toBe(true);
		for (const code of ['PLN', 'ZAR', 'KRW', 'KWD', 'ISK', 'INR']) {
			expect(isCurrency(code), code).toBe(true);
		}
	});

	test('three letters that are not a currency are not one', () => {
		// The case that used to pass: `Intl` renders `ZZZ 12.50` quite happily.
		for (const bad of ['ZZZ', 'XXX', 'ABC', 'QQQ']) {
			expect(isCurrency(bad), bad).toBe(false);
		}
	});

	test('and neither is anything that is not three letters', () => {
		for (const bad of ['', 'BR', 'BRLL', 'B7L', 'R$', null, undefined, 42, {}]) {
			expect(isCurrency(bad)).toBe(false);
		}
	});

	test('normalising takes what somebody would type', () => {
		expect(normaliseCurrency(' brl ')).toBe('BRL');
		expect(normaliseCurrency('pln')).toBe('PLN');
		expect(normaliseCurrency('zzz')).toBeNull();
		expect(normaliseCurrency('')).toBeNull();
	});

	test('the full list is offerable and contains the shortlist', () => {
		const all = allCurrencies();
		expect(all.length).toBeGreaterThan(100);
		for (const code of CURRENCIES) expect(all).toContain(code);
	});
});

describe('minor units', () => {
	/**
	 * A round trip is the honest test: whatever `parseMoney` stores,
	 * `formatMoney` has to print back as the same amount of money.
	 */
	const roundTrip = (typed: string, currency: string) =>
		formatMoney(parseMoney(typed, currency)!, currency, 'en-GB');

	test('two, for most', () => {
		expect(parseMoney('12.50', 'BRL')).toBe(1250);
		expect(parseMoney('12,50', 'EUR')).toBe(1250);
		expect(roundTrip('12.50', 'GBP')).toContain('12.50');
	});

	test('none, for the ones that have none', () => {
		// 1500 won is 1500, not 150,000.
		expect(parseMoney('1500', 'KRW')).toBe(1500);
		expect(parseMoney('1500', 'JPY')).toBe(1500);
		expect(roundTrip('1500', 'JPY')).toContain('1,500');
	});

	test('three, for the ones that have three', () => {
		expect(parseMoney('1.500', 'KWD')).toBe(1500);
		expect(roundTrip('1.500', 'KWD')).toContain('1.500');
	});

	test('nothing that is not a price becomes one', () => {
		for (const bad of ['', '   ', 'abc', '-5']) {
			expect(parseMoney(bad, 'BRL'), bad).toBeNull();
		}
	});
});

describe('printing', () => {
	test('the symbol where there is one', () => {
		expect(formatMoney(1250, 'BRL', 'pt-BR')).toContain('R$');
		expect(formatMoney(1250, 'GBP', 'en-GB')).toContain('£');
	});

	test('and the code where there is not', () => {
		expect(formatMoney(1250, 'PLN', 'en-GB')).toContain('PLN');
	});

	/**
	 * A code stored before this runtime knew it — an account that moved between
	 * machines, or a currency that was retired. A page of prices must render.
	 */
	test('a code this runtime does not know still prints a number', () => {
		const out = formatMoney(1250, 'ZZZ', 'en-GB');
		expect(out).toContain('12.50');
		expect(out).toContain('ZZZ');
	});
});
