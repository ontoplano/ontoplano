/**
 * Money, in the smallest unit of one currency.
 *
 * Integers, because a price added up in floating point is wrong by a cent
 * eventually and always in front of somebody. One currency per account: a
 * shopping list in three currencies is a spreadsheet, not a list.
 */
/**
 * The ones on the list, which is not the same as the ones allowed.
 *
 * Eight is a shortlist, not a limit: it covers most people in one click and it
 * used to be the whole of what the app would take, which meant somebody paid in
 * zloty or rand could not record what they spend. Anything `Intl` will format
 * is accepted now — see `isCurrency`.
 */
export const CURRENCIES = ['BRL', 'EUR', 'GBP', 'USD', 'CHF', 'JPY', 'CAD', 'AUD'] as const;

/**
 * Any ISO 4217 code, not just the eight above.
 *
 * A string rather than a union, because the set is the platform's and not this
 * file's — and a union of eight was a promise the app could not keep the moment
 * anybody outside those eight tried to use it.
 */
export type Currency = string;

export const DEFAULT_CURRENCY: Currency = 'BRL';

/**
 * Every currency this platform knows, which is ISO 4217.
 *
 * Not "whether `Intl.NumberFormat` will format it", which was the first answer
 * and is wrong: it formats *any* three letters, printing the code where the
 * symbol goes — so `ZZZ` passed, and somebody who fat-fingered their code got
 * a shopping list quoted in nothing at all with no complaint.
 */
function known(): Set<string> {
	const of = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
	if (typeof of === 'function') {
		try {
			return new Set(of('currency'));
		} catch {
			/* fall through */
		}
	}
	// A runtime without the list: the shortlist, so the field still works for
	// most people rather than refusing everybody.
	return new Set(CURRENCIES);
}

let codes: Set<string> | null = null;

/** Whether this is a real currency code. */
export function isCurrency(value: unknown): value is Currency {
	if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value)) return false;
	codes ??= known();
	return codes.has(value.toUpperCase());
}

/** All of them, for a picker that wants to offer the rest. */
export function allCurrencies(): string[] {
	codes ??= known();
	return [...codes].sort();
}

/** Upper-cased and trimmed, or null if it is not one. */
export function normaliseCurrency(value: unknown): Currency | null {
	const code = String(value ?? '')
		.trim()
		.toUpperCase();
	return isCurrency(code) ? code : null;
}

/**
 * How many minor units make one.
 *
 * Asked of `Intl` rather than hardcoded. It used to be "a hundred, unless it is
 * yen", which is right for eight currencies and wrong for the rest: won, dong
 * and króna have none, and dinar has a thousand. A price stored a hundred times
 * too small is not a rounding error.
 */
function minorUnits(currency: Currency): number {
	try {
		const digits = new Intl.NumberFormat('en', {
			style: 'currency',
			currency
		}).resolvedOptions().maximumFractionDigits;
		return 10 ** (digits ?? 2);
	} catch {
		return 100;
	}
}

export function formatMoney(cents: number, currency: Currency, locale?: string): string {
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
			cents / minorUnits(currency)
		);
	} catch {
		// A stored code this runtime does not know. Printing the number with the
		// code beside it is worse than the real thing and better than a page that
		// throws on every row.
		return `${currency} ${(cents / 100).toFixed(2)}`;
	}
}

/** "12,50" or "12.50" → 1250. Returns null for anything that is not a price. */
export function parseMoney(raw: unknown, currency: Currency): number | null {
	const text = String(raw ?? '')
		.trim()
		.replace(/[^\d.,-]/g, '');
	if (!text) return null;

	/*
	 * A comma is the decimal separator in most of the places this will run, and
	 * a dot before exactly three digits is usually a thousands separator —
	 * `1.500` is fifteen hundred.
	 *
	 * Usually. In a currency with three decimal places it is one and a half, and
	 * stripping the dot there multiplies the price by a thousand. So the guess is
	 * only made where it can be right.
	 */
	const units = minorUnits(currency);
	const normalised = (units < 1000 ? text.replace(/\.(?=\d{3}\b)/g, '') : text).replace(',', '.');
	const value = Number(normalised);
	if (!Number.isFinite(value) || value < 0) return null;

	return Math.round(value * units);
}
