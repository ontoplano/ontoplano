/**
 * Bills, and the number the whole finance section is built to measure.
 *
 * A bill carries an *expected* amount; marking it paid records what was
 * *actually* paid, and the two can differ. That gap is the point, so a payment
 * is its own row, not a flag — and paying the same period twice corrects the
 * first rather than doubling it. The expected amount is snapshotted at pay
 * time, so editing the bill later does not rewrite history. And a bill, its
 * categories and its payments are all one account's; another's cannot reach
 * them.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let bills: typeof import('../src/lib/server/services/bills');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	bills = await import('../src/lib/server/services/bills');
	ctx = { userId: OWNER, now: new Date('2026-09-06T12:00:00Z'), tz: 'UTC' };
	theirs = { ...ctx, userId: STRANGER };
});

describe('a bill', () => {
	test('is created with an expected amount and a rhythm', () => {
		const bill = bills.createBill(ctx, { name: 'Rent', amountExpected: 120000, dueDay: 5 });
		expect(bill.name).toBe('Rent');
		expect(bill.amountExpected).toBe(120000);
		expect(bill.rhythm).toBe('monthly');
		expect(bill.active).toBe(true);
	});

	test('a due day outside a real month is refused', () => {
		expect(() => bills.createBill(ctx, { name: 'Bad', dueDay: 31 })).toThrow();
	});

	test('archiving keeps it out of the active list but not the full one', () => {
		const bill = bills.createBill(ctx, { name: 'Old gym', amountExpected: 9900 });
		bills.setArchived(ctx, bill.id, true);
		expect(bills.listBills(ctx).some((b) => b.id === bill.id)).toBe(false);
		expect(bills.listBills(ctx, { includeArchived: true }).some((b) => b.id === bill.id)).toBe(
			true
		);
	});
});

describe('paying a bill', () => {
	test('records what was actually paid, which may differ from expected', () => {
		const bill = bills.createBill(ctx, { name: 'Water', amountExpected: 8000 });
		const paid = bills.markPaid(ctx, bill.id, { amountPaid: 9150, period: '2026-09' });
		expect(paid.amountExpected).toBe(8000); // snapshot of the bill at pay time
		expect(paid.amountPaid).toBe(9150);
		expect(paid.period).toBe('2026-09');
	});

	test('with no amount given, it is assumed to be the expected one', () => {
		const bill = bills.createBill(ctx, { name: 'Streaming', amountExpected: 2990 });
		const paid = bills.markPaid(ctx, bill.id, { period: '2026-09' });
		expect(paid.amountPaid).toBe(2990);
	});

	test('paying the same period again corrects it, never doubles it', () => {
		const bill = bills.createBill(ctx, { name: 'Power', amountExpected: 5000 });
		bills.markPaid(ctx, bill.id, { amountPaid: 5200, period: '2026-09' });
		bills.markPaid(ctx, bill.id, { amountPaid: 4800, period: '2026-09' });
		const rows = bills.listPayments(ctx, bill.id);
		expect(rows).toHaveLength(1);
		expect(rows[0].amountPaid).toBe(4800);
	});

	test('the snapshot survives a later edit to the bill', () => {
		const bill = bills.createBill(ctx, { name: 'Gas', amountExpected: 4000 });
		bills.markPaid(ctx, bill.id, { amountPaid: 4000, period: '2026-09' });
		bills.updateBill(ctx, bill.id, { name: 'Gas', amountExpected: 6000 });
		expect(bills.listPayments(ctx, bill.id)[0].amountExpected).toBe(4000);
	});

	test('a period defaults to the month the clock is in', () => {
		const bill = bills.createBill(ctx, { name: 'Internet', amountExpected: 7000 });
		const paid = bills.markPaid(ctx, bill.id, { amountPaid: 7000 });
		expect(paid.period).toBe('2026-09'); // ctx.now is 2026-09-06
	});

	test('a weekly bill settles into an ISO week, not a month', () => {
		const bill = bills.createBill(ctx, { name: 'Cleaner', amountExpected: 6000, rhythm: 'weekly' });
		const paid = bills.markPaid(ctx, bill.id, { amountPaid: 6000 });
		// 2026-09-06 is a Sunday — ISO week 36 of 2026.
		expect(paid.period).toBe('2026-W36');
		expect(bills.periodFor('weekly', new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
	});

	test('unmarking a period removes the payment', () => {
		const bill = bills.createBill(ctx, { name: 'Phone', amountExpected: 3000 });
		bills.markPaid(ctx, bill.id, { amountPaid: 3000, period: '2026-09' });
		bills.unmarkPaid(ctx, bill.id, '2026-09');
		expect(bills.listPayments(ctx, bill.id)).toHaveLength(0);
	});
});

describe('when a bill wants paying', () => {
	test('the lead moves it earlier than the due day, and it carries both', () => {
		const mine = { ...ctx, userId: `bills-due-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'D', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		// Due the 10th, wanted three days earlier.
		bills.createBill(mine, { name: 'Rent', amountExpected: 100000, dueDay: 10, payLeadDays: 3 });

		const due = bills.billsDueBetween(mine, '2026-09-01', '2026-09-30');
		expect(due).toHaveLength(1);
		expect(due[0].date).toBe('2026-09-07'); // when it turns up on the week
		expect(due[0].dueDate).toBe('2026-09-10'); // the last day it can be paid
		expect(due[0].period).toBe('2026-09');
		expect(due[0].paid).toBe(false);
	});

	test('a lead can reach back into the month before', () => {
		const mine = { ...ctx, userId: `bills-lead-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'L', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		// Due the 2nd, wanted five days before — that is the 28th of August, and
		// a window over August has to find it.
		bills.createBill(mine, { name: 'Water', amountExpected: 8000, dueDay: 2, payLeadDays: 5 });

		const august = bills.billsDueBetween(mine, '2026-08-01', '2026-08-31');
		expect(august.map((d) => d.date)).toContain('2026-08-28');
		expect(august.find((d) => d.date === '2026-08-28')!.period).toBe('2026-09');
	});

	test('paying it marks that occurrence, and only that one', () => {
		const mine = { ...ctx, userId: `bills-paid-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'P', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		const bill = bills.createBill(mine, { name: 'Power', amountExpected: 5000, dueDay: 12 });
		bills.markPaid(mine, bill.id, { period: '2026-09' });

		const twoMonths = bills.billsDueBetween(mine, '2026-09-01', '2026-10-31');
		expect(twoMonths.find((d) => d.period === '2026-09')!.paid).toBe(true);
		expect(twoMonths.find((d) => d.period === '2026-10')!.paid).toBe(false);
	});

	test('a bill with no due day never lands on the week', () => {
		const mine = { ...ctx, userId: `bills-nodue-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'N', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		bills.createBill(mine, { name: 'Something', amountExpected: 100 });
		expect(bills.billsDueBetween(mine, '2026-09-01', '2026-09-30')).toHaveLength(0);
	});

	test('an archived bill stops asking to be paid', () => {
		const mine = { ...ctx, userId: `bills-arch-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'A', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		const bill = bills.createBill(mine, { name: 'Old gym', amountExpected: 9900, dueDay: 5 });
		expect(bills.billsDueBetween(mine, '2026-09-01', '2026-09-30')).toHaveLength(1);
		bills.setArchived(mine, bill.id, true);
		expect(bills.billsDueBetween(mine, '2026-09-01', '2026-09-30')).toHaveLength(0);
	});
});

describe('the month at a glance', () => {
	test('expected, paid, and the gap between them', () => {
		const mine = { ...ctx, userId: `bills-month-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'M', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		const a = bills.createBill(mine, { name: 'A', amountExpected: 10000 });
		const b = bills.createBill(mine, { name: 'B', amountExpected: 5000 });
		bills.createBill(mine, { name: 'C', amountExpected: 2000 });
		bills.markPaid(mine, a.id, { amountPaid: 10500, period: '2026-09' });
		bills.markPaid(mine, b.id, { amountPaid: 5000, period: '2026-09' });

		const s = bills.monthSummary(mine, '2026-09');
		expect(s.expected).toBe(17000); // all three monthly bills
		expect(s.paid).toBe(15500); // two paid, one over
		expect(s.difference).toBe(15500 - 17000);
		expect(s.paidCount).toBe(2);
		expect(s.billCount).toBe(3);
	});
});

describe('one account cannot reach another’s', () => {
	test('a stranger cannot see, pay, or delete a bill', () => {
		const bill = bills.createBill(ctx, { name: 'Private', amountExpected: 1000 });
		expect(() => bills.getBill(theirs, bill.id)).toThrow();
		expect(() => bills.markPaid(theirs, bill.id, { amountPaid: 1000 })).toThrow();
		expect(() => bills.deleteBill(theirs, bill.id)).toThrow();
		expect(bills.listBills(theirs).some((b) => b.id === bill.id)).toBe(false);
	});
});
