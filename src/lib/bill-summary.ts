import { formatMoney, type Currency } from './money.js';
import type { PlainKey } from './i18n/keys.js';
import type { Translate } from './i18n/index.js';

/**
 * What a bill is, in one line.
 *
 * Written inside the Finance room, which is why a bill filed under a notebook
 * described itself differently — the amount and a word, where the room says
 * the amount, the rhythm, the day it falls due and how early it wants paying.
 * The same row draws both now (`BillRow`), and this is the sentence under the
 * name in each of them.
 *
 * The tables are here rather than in the page for the same reason: a rhythm's
 * own word is not something two screens should each decide.
 */

export const RHYTHMS: { value: string; label: PlainKey }[] = [
	{ value: 'monthly', label: 'app.monthly' },
	{ value: 'weekly', label: 'app.weekly' },
	{ value: 'yearly', label: 'app.yearly' },
	{ value: 'once', label: 'app.oneOff' }
];

export const WEEKDAYS: { value: number; label: PlainKey }[] = [
	{ value: 1, label: 'app.monday' },
	{ value: 2, label: 'app.tuesday' },
	{ value: 3, label: 'app.wednesday' },
	{ value: 4, label: 'app.thursday' },
	{ value: 5, label: 'app.friday' },
	{ value: 6, label: 'app.saturday' },
	{ value: 7, label: 'app.sunday' }
];

export const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** The rhythm's own word, not the key it is under. */
export function rhythmLabel(t: Translate, rhythm: string): string {
	const found = RHYTHMS.find((one) => one.value === rhythm);
	return found ? t(found.label) : rhythm;
}

/** Money as it is typed into a field: the major unit, two places. */
export function asDecimal(cents: number): string {
	return (cents / 100).toFixed(2);
}

type Summarised = {
	amountExpected: number;
	rhythm: string;
	dueDay: number | null;
	dueMonth: number | null;
	payLeadDays: number;
};

export function summaryOf(t: Translate, bill: Summarised, currency: Currency): string {
	let line = `${formatMoney(bill.amountExpected, currency)} · ${rhythmLabel(t, bill.rhythm)}`;
	if (bill.dueDay) {
		if (bill.rhythm === 'weekly') {
			const weekday = WEEKDAYS.find((d) => d.value === bill.dueDay);
			line += t('finance.bills.dueEveryWeekday', { weekday: weekday ? t(weekday.label) : '' });
		} else if (bill.rhythm === 'yearly') {
			line += `, due ${MONTHS[(bill.dueMonth ?? 1) - 1]} ${bill.dueDay}`;
		} else {
			line += `, due the ${bill.dueDay}`;
		}
		if (bill.payLeadDays > 0)
			line += `, pay ${bill.payLeadDays} ${bill.payLeadDays === 1 ? 'day' : 'days'} before`;
	}
	return line;
}
