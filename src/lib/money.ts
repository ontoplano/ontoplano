/**
 * Money, in the smallest unit of one currency.
 *
 * Integers, because a price added up in floating point is wrong by a cent
 * eventually and always in front of somebody. One currency per account: a
 * shopping list in three currencies is a spreadsheet, not a list.
 */
export const CURRENCIES = ['BRL', 'EUR', 'GBP', 'USD', 'CHF', 'JPY', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'BRL';

export function isCurrency(value: unknown): value is Currency {
	return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

/** How many minor units make one — not every currency has a hundred. */
function minorUnits(currency: Currency): number {
	return currency === 'JPY' ? 1 : 100;
}

export function formatMoney(cents: number, currency: Currency, locale?: string): string {
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
		cents / minorUnits(currency)
	);
}

/** "12,50" or "12.50" → 1250. Returns null for anything that is not a price. */
export function parseMoney(raw: unknown, currency: Currency): number | null {
	const text = String(raw ?? '')
		.trim()
		.replace(/[^\d.,-]/g, '');
	if (!text) return null;

	// A comma is the decimal separator in most of the places this will run.
	const normalised = text.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
	const value = Number(normalised);
	if (!Number.isFinite(value) || value < 0) return null;

	return Math.round(value * minorUnits(currency));
}
