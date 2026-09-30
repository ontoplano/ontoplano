import type { PlainKey } from './i18n/keys.js';

/**
 * The orders a list of bills can be read in.
 *
 * `due` is the one it opens in: what falls due next at the top, and what is
 * already settled this period below everything that is not — the list is
 * read to find what still wants paying.
 */
export const BILL_ORDERS = ['due', 'amount', 'name'] as const;
export type BillOrder = (typeof BILL_ORDERS)[number];
export type BillDirection = 'asc' | 'desc';

export const BILL_ORDER_LABELS: Record<BillOrder, PlainKey> = {
	due: 'finance.bills.orderDue',
	amount: 'finance.bills.orderAmount',
	name: 'finance.bills.orderName'
};

/** Which way each order reads when it is first picked. */
export const directionFor = (order: BillOrder): BillDirection =>
	order === 'amount' ? 'desc' : 'asc';

type Orderable = {
	name: string;
	amountExpected: number;
	rhythm: string;
	dueDay: number | null;
	dueMonth: number | null;
	paidThisPeriod?: boolean;
	skippedThisPeriod?: boolean;
};

const DAY_MS = 86_400_000;

/**
 * Whole days from `today` (`YYYY-MM-DD`) to the bill's next due day, today
 * being 0. A bill with no due day — a one-off, or one nobody gave a day —
 * has no next one, and sorts after every bill that does.
 */
export function daysUntilDue(bill: Orderable, today: string): number {
	const day = bill.dueDay;
	if (day === null) return Infinity;
	const [y, m, d] = today.split('-').map(Number);
	const now = Date.UTC(y, m - 1, d);
	const until = (date: number) => Math.round((date - now) / DAY_MS);
	/** The due day in a month, pulled back to its last day when the month is short. */
	const inMonth = (year: number, month: number) =>
		Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()));

	switch (bill.rhythm) {
		case 'weekly': {
			// Monday is 1 in the column; JS calls Sunday 0.
			const weekday = new Date(now).getUTCDay() || 7;
			return (day - weekday + 7) % 7;
		}
		case 'monthly': {
			const here = inMonth(y, m - 1);
			return here >= now ? until(here) : until(inMonth(y, m));
		}
		case 'yearly': {
			const month = (bill.dueMonth ?? 1) - 1;
			const here = inMonth(y, month);
			return here >= now ? until(here) : until(inMonth(y + 1, month));
		}
		default:
			return Infinity;
	}
}

/** A copy of `bills` in the order asked for. */
export function orderBills<T extends Orderable>(
	bills: readonly T[],
	order: BillOrder,
	direction: BillDirection,
	today: string
): T[] {
	const sign = direction === 'asc' ? 1 : -1;
	const settled = (b: T) => (b.paidThisPeriod || b.skippedThisPeriod ? 1 : 0);
	const byName = (a: T, b: T) => a.name.localeCompare(b.name);
	const compare = (a: T, b: T): number => {
		if (order === 'name') return sign * byName(a, b);
		if (order === 'amount') return sign * (a.amountExpected - b.amountExpected) || byName(a, b);
		// Settled sinks whichever way the days run, and so does a bill with no
		// day: flipping the direction asks for the furthest-off first, not for
		// the paid ones on top.
		const dueA = daysUntilDue(a, today);
		const dueB = daysUntilDue(b, today);
		const dayless = Number(dueA === Infinity) - Number(dueB === Infinity);
		const days = dayless === 0 && dueA !== Infinity ? dueA - dueB : 0;
		return settled(a) - settled(b) || dayless || sign * days || byName(a, b);
	};
	return [...bills].sort(compare);
}
