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

let bills: typeof import('../src/lib/services/bills');
let ctx: { userId: string; now: Date; tz: string };
let theirs: { userId: string; now: Date; tz: string };

beforeAll(async () => {
	bills = await import('../src/lib/services/bills');
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

	test('corrects a paid date and amount in the account timezone', () => {
		const bill = bills.createBill(ctx, { name: 'Cleaner', amountExpected: 5000 });
		const paid = bills.markPaid(ctx, bill.id, { amountPaid: 5000, period: '2026-09' });
		const corrected = bills.updatePayment({ ...ctx, tz: 'America/Sao_Paulo' }, bill.id, paid.id, {
			paidDate: '2026-09-05',
			amountPaid: 4500
		});
		expect(corrected.paidAt).toBe('2026-09-05T15:00:00.000Z');
		expect(corrected.amountPaid).toBe(4500);
		expect(corrected.period).toBe('2026-09');
		expect(bills.listPayments(ctx, bill.id)).toHaveLength(1);
	});

	test('a payment correction cannot reach another bill or account', () => {
		const bill = bills.createBill(ctx, { name: 'Internet', amountExpected: 7000 });
		const other = bills.createBill(ctx, { name: 'Water', amountExpected: 3000 });
		const paid = bills.markPaid(ctx, bill.id, { period: '2026-09' });
		const change = { paidDate: '2026-09-05', amountPaid: 4000 };
		expect(() => bills.updatePayment(ctx, other.id, paid.id, change)).toThrow();
		expect(() => bills.updatePayment(theirs, bill.id, paid.id, change)).toThrow();
		expect(() =>
			bills.updatePayment(ctx, bill.id, paid.id, { ...change, paidDate: '2026-02-30' })
		).toThrow();
		expect(bills.listPayments(ctx, bill.id)[0].amountPaid).toBe(7000);
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

	test('a weekly bill falls on its weekday, every week', () => {
		const mine = { ...ctx, userId: `bills-weekly-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'W', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		// Fridays — 5 counting Monday as 1, which is how the column reads.
		bills.createBill(mine, {
			name: 'Cleaner',
			amountExpected: 12000,
			rhythm: 'weekly',
			dueDay: 5
		});

		const due = bills.billsDueBetween(mine, '2026-09-01', '2026-09-30');
		// Every Friday in September 2026: the 4th, 11th, 18th and 25th.
		expect(due.map((d) => d.dueDate)).toEqual([
			'2026-09-04',
			'2026-09-11',
			'2026-09-18',
			'2026-09-25'
		]);
		expect(due.every((d) => new Date(`${d.dueDate}T00:00:00Z`).getUTCDay() === 5)).toBe(true);
	});

	test('a weekly bill can be paid one week and not the next', () => {
		const mine = { ...ctx, userId: `bills-wpaid-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'W2', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		const bill = bills.createBill(mine, {
			name: 'Cleaner',
			amountExpected: 12000,
			rhythm: 'weekly',
			dueDay: 5
		});
		// The ISO week of Friday 11 September 2026.
		const week = bills.periodFor('weekly', new Date('2026-09-11T00:00:00Z'));
		bills.markPaid(mine, bill.id, { period: week });

		const due = bills.billsDueBetween(mine, '2026-09-01', '2026-09-30');
		expect(due.find((d) => d.dueDate === '2026-09-11')!.paid).toBe(true);
		expect(due.find((d) => d.dueDate === '2026-09-18')!.paid).toBe(false);
	});

	test('a yearly bill falls on its date, once a year', () => {
		const mine = { ...ctx, userId: `bills-yearly-${Date.now()}` };
		database.exec(
			`insert into user (id, name, email, email_verified, created_at, updated_at)
			 values (?, 'Y', ?, 1, 0, 0)`,
			mine.userId,
			`${mine.userId}@t.test`
		);
		// The insurance, every 15 March, wanted a week early.
		bills.createBill(mine, {
			name: 'Insurance',
			amountExpected: 90000,
			rhythm: 'yearly',
			dueMonth: 3,
			dueDay: 15,
			payLeadDays: 7
		});

		const inMarch = bills.billsDueBetween(mine, '2026-03-01', '2026-03-31');
		expect(inMarch).toHaveLength(1);
		expect(inMarch[0].dueDate).toBe('2026-03-15');
		expect(inMarch[0].date).toBe('2026-03-08');
		expect(inMarch[0].period).toBe('2026');

		// And not in a month it does not fall in.
		expect(bills.billsDueBetween(mine, '2026-06-01', '2026-06-30')).toHaveLength(0);
		// Two years, two occurrences.
		expect(bills.billsDueBetween(mine, '2026-01-01', '2027-12-31')).toHaveLength(2);
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

/** A fresh account, so a test's bills are the only ones it sees. */
function freshAccount(prefix: string, now: string, tz = 'UTC') {
	const mine = { userId: `${prefix}-${Date.now()}-${Math.random()}`, now: new Date(now), tz };
	database.exec(
		`insert into user (id, name, email, email_verified, created_at, updated_at)
		 values (?, 'F', ?, 1, 0, 0)`,
		mine.userId,
		`${mine.userId}@t.test`
	);
	return mine;
}

describe('skipping a period', () => {
	test('is recorded as skipped, pays nothing, and can be undone', () => {
		const bill = bills.createBill(ctx, { name: 'Gym', amountExpected: 14000, dueDay: 8 });
		const skipped = bills.skipPeriod(ctx, bill.id, { period: '2026-09' });
		expect(skipped.status).toBe('skipped');
		expect(skipped.amountPaid).toBe(0);

		const listed = bills.listBillsThisPeriod(ctx).find((b) => b.id === bill.id)!;
		expect(listed.skippedThisPeriod).toBe(true);
		expect(listed.paidThisPeriod).toBe(false);

		// Undoing a payment does not touch a skip, and unskip does.
		bills.unmarkPaid(ctx, bill.id, '2026-09');
		expect(bills.listPayments(ctx, bill.id)).toHaveLength(1);
		bills.unskipPeriod(ctx, bill.id, '2026-09');
		expect(bills.listPayments(ctx, bill.id)).toHaveLength(0);
	});

	test('is refused on a period that is paid, and paying a skipped one replaces the skip', () => {
		const bill = bills.createBill(ctx, { name: 'Cinema club', amountExpected: 3000 });
		bills.markPaid(ctx, bill.id, { period: '2026-09' });
		expect(() => bills.skipPeriod(ctx, bill.id, { period: '2026-09' })).toThrow();

		bills.skipPeriod(ctx, bill.id, { period: '2026-10' });
		const paid = bills.markPaid(ctx, bill.id, { period: '2026-10', amountPaid: 2500 });
		expect(paid.status).toBe('paid');
		expect(paid.amountPaid).toBe(2500);
	});

	test('takes it off the week and out of the month’s expected total', () => {
		const mine = freshAccount('bills-skip', '2026-09-06T12:00:00Z');
		const rent = bills.createBill(mine, { name: 'Rent', amountExpected: 100000, dueDay: 10 });
		bills.createBill(mine, { name: 'Water', amountExpected: 8000, dueDay: 12 });
		bills.skipPeriod(mine, rent.id, { period: '2026-09' });

		const due = bills.billsDueBetween(mine, '2026-09-01', '2026-09-30');
		expect(due.map((d) => d.name)).toEqual(['Water']);

		const month = bills.monthSummary(mine, '2026-09');
		expect(month.expected).toBe(8000);
		expect(month.paidCount).toBe(0);
	});
});

describe('the history', () => {
	test('averages what was paid over the periods that were paid', () => {
		const bill = bills.createBill(ctx, { name: 'Electricity', amountExpected: 10000 });
		bills.markPaid(ctx, bill.id, { period: '2026-06', amountPaid: 9000 });
		bills.markPaid(ctx, bill.id, { period: '2026-07', amountPaid: 12000 });
		bills.skipPeriod(ctx, bill.id, { period: '2026-08' });

		const history = bills.billHistory(ctx, bill.id);
		expect(history.entries.map((e) => e.period)).toEqual(['2026-08', '2026-07', '2026-06']);
		expect(history.paidCount).toBe(2);
		expect(history.skippedCount).toBe(1);
		expect(history.totalPaid).toBe(21000);
		expect(history.averagePaid).toBe(10500);
	});

	test('has no average before anything was paid', () => {
		expect(bills.summariseHistory([]).averagePaid).toBeNull();
	});
});

describe('an automatic bill', () => {
	test('never lands on the week, and its payments are written on each due day from then on', () => {
		const mine = freshAccount('bills-auto', '2026-09-06T12:00:00Z');
		const bill = bills.createBill(mine, {
			name: 'Streaming',
			amountExpected: 2990,
			dueDay: 10,
			automatic: true
		});
		expect(bill.automatic).toBe(true);
		expect(bills.billsDueBetween(mine, '2026-09-01', '2026-09-30')).toHaveLength(0);

		// Nothing before it was made automatic, and nothing before the due day.
		expect(bills.recordAutomaticPayments(mine)).toBe(0);
		expect(bills.listPayments(mine, bill.id)).toHaveLength(0);

		// Two due days later, both are written, as the app's own, for the expected amount.
		const later = { ...mine, now: new Date('2026-10-20T12:00:00Z') };
		expect(bills.recordAutomaticPayments(later)).toBe(2);
		const written = bills.listPayments(later, bill.id);
		expect(written.map((p) => p.period)).toEqual(['2026-10', '2026-09']);
		expect(written.every((p) => p.automatic && p.status === 'paid')).toBe(true);
		expect(written[0].amountPaid).toBe(2990);
		expect(written[1].paidAt.slice(0, 10)).toBe('2026-09-10');

		// Idempotent, and an undone payment stays undone.
		bills.unmarkPaid(later, bill.id, '2026-10');
		expect(bills.recordAutomaticPayments(later)).toBe(0);
		expect(bills.listPayments(later, bill.id)).toHaveLength(1);
	});

	test('leaves a period already skipped by hand alone', () => {
		const mine = freshAccount('bills-auto-skip', '2026-09-06T12:00:00Z');
		const bill = bills.createBill(mine, {
			name: 'Gym',
			amountExpected: 9900,
			dueDay: 10,
			automatic: true
		});
		bills.skipPeriod(mine, bill.id, { period: '2026-09' });
		const later = { ...mine, now: new Date('2026-09-15T12:00:00Z') };
		expect(bills.recordAutomaticPayments(later)).toBe(0);
		expect(bills.listPayments(later, bill.id)[0].status).toBe('skipped');
	});

	test('starts fresh when it stops being automatic and becomes it again', () => {
		const mine = freshAccount('bills-auto-toggle', '2026-09-06T12:00:00Z');
		const bill = bills.createBill(mine, {
			name: 'Cloud',
			amountExpected: 1000,
			dueDay: 10,
			automatic: true
		});
		const off = { ...mine, now: new Date('2026-09-07T12:00:00Z') };
		bills.updateBill(off, bill.id, { name: 'Cloud', amountExpected: 1000, dueDay: 10 });
		const on = { ...mine, now: new Date('2026-11-01T12:00:00Z') };
		bills.updateBill(on, bill.id, {
			name: 'Cloud',
			amountExpected: 1000,
			dueDay: 10,
			automatic: true
		});
		// September and October passed while it was paid by hand: not invented.
		expect(bills.recordAutomaticPayments(on)).toBe(0);
		expect(bills.listPayments(on, bill.id)).toHaveLength(0);
	});
});

describe('one account cannot reach another’s skips or history', () => {
	test('a stranger cannot skip, unskip, or read the history of a bill', () => {
		const bill = bills.createBill(ctx, { name: 'Private sub', amountExpected: 1000 });
		bills.skipPeriod(ctx, bill.id, { period: '2026-05' });
		expect(() => bills.skipPeriod(theirs, bill.id, { period: '2026-06' })).toThrow();
		expect(() => bills.unskipPeriod(theirs, bill.id, '2026-05')).toThrow();
		expect(() => bills.billHistory(theirs, bill.id)).toThrow();
		expect(bills.listPayments(ctx, bill.id)).toHaveLength(1);
	});
});
