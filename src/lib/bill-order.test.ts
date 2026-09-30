import { describe, expect, it } from 'vitest';
import { daysUntilDue, orderBills } from './bill-order';

const bill = (over: Partial<Parameters<typeof daysUntilDue>[0]> & { name: string }) => ({
	amountExpected: 100,
	rhythm: 'monthly',
	dueDay: 1,
	dueMonth: null,
	...over
});

describe('daysUntilDue', () => {
	it('counts to this month, or to next month once the day has gone', () => {
		expect(daysUntilDue(bill({ name: 'a', dueDay: 30 }), '2026-09-28')).toBe(2);
		expect(daysUntilDue(bill({ name: 'a', dueDay: 28 }), '2026-09-28')).toBe(0);
		expect(daysUntilDue(bill({ name: 'a', dueDay: 3 }), '2026-09-28')).toBe(5);
	});

	it('pulls a day past the end of a short month back to its last day', () => {
		expect(daysUntilDue(bill({ name: 'a', dueDay: 31 }), '2026-02-27')).toBe(1);
	});

	it('counts weekdays and years', () => {
		// 2026-09-28 is a Monday.
		expect(daysUntilDue(bill({ name: 'a', rhythm: 'weekly', dueDay: 1 }), '2026-09-28')).toBe(0);
		expect(daysUntilDue(bill({ name: 'a', rhythm: 'weekly', dueDay: 7 }), '2026-09-28')).toBe(6);
		expect(
			daysUntilDue(bill({ name: 'a', rhythm: 'yearly', dueDay: 1, dueMonth: 1 }), '2026-12-31')
		).toBe(1);
	});

	it('has no next day for a one-off or a bill without a day', () => {
		expect(daysUntilDue(bill({ name: 'a', rhythm: 'once' }), '2026-09-28')).toBe(Infinity);
		expect(daysUntilDue(bill({ name: 'a', dueDay: null }), '2026-09-28')).toBe(Infinity);
	});
});

describe('orderBills', () => {
	const today = '2026-09-28';
	const bills = [
		bill({ name: 'Paid', dueDay: 29, paidThisPeriod: true }),
		bill({ name: 'Later', dueDay: 20, amountExpected: 300 }),
		bill({ name: 'Soon', dueDay: 30, amountExpected: 50 }),
		bill({ name: 'Dayless', dueDay: null })
	];
	const names = (list: { name: string }[]) => list.map((b) => b.name);

	it('puts what falls due next first, the settled and the dayless last', () => {
		expect(names(orderBills(bills, 'due', 'asc', today))).toEqual([
			'Soon',
			'Later',
			'Dayless',
			'Paid'
		]);
	});

	it('flips the days but not where the settled and dayless go', () => {
		expect(names(orderBills(bills, 'due', 'desc', today))).toEqual([
			'Later',
			'Soon',
			'Dayless',
			'Paid'
		]);
	});

	it('orders by amount and by name', () => {
		expect(names(orderBills(bills, 'amount', 'desc', today))[0]).toBe('Later');
		expect(names(orderBills(bills, 'name', 'asc', today))).toEqual([
			'Dayless',
			'Later',
			'Paid',
			'Soon'
		]);
	});
});
