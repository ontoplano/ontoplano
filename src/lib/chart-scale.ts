import { minorUnits, type Currency } from './money.js';

/**
 * The numbers up the side of a chart.
 *
 * Round steps — 1, 2 or 5 times a power of ten — so the lines fall on values
 * somebody can read at a glance ($2.5K, $5K, $7.5K is not one of them; $2K,
 * $4K, $6K is). The last tick is at or above the peak, and it is the top of
 * the scale, so the tallest bar never runs off the plot.
 */
export function niceTicks(peak: number, count = 4): number[] {
	if (!(peak > 0)) return [0];
	const rough = peak / count;
	const power = 10 ** Math.floor(Math.log10(rough));
	const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
	const ticks: number[] = [0];
	while (ticks[ticks.length - 1] < peak) ticks.push(ticks[ticks.length - 1] + step);
	return ticks;
}

/**
 * Money the short way, for where a whole amount does not fit: `$1.2K`, `R$ 3 mil`.
 *
 * `signed` writes the sign on both sides of zero, for a net that reads as a
 * gain or a loss rather than as an amount.
 */
export function compactMoney(
	cents: number,
	currency: Currency,
	{ signed = false, locale }: { signed?: boolean; locale?: string } = {}
): string {
	const value = cents / minorUnits(currency);
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			notation: 'compact',
			maximumSignificantDigits: 2,
			signDisplay: signed ? 'exceptZero' : 'auto'
		}).format(value);
	} catch {
		return `${currency} ${Math.round(value)}`;
	}
}
