/**
 * Bills: money expected to go out, on a rhythm.
 *
 * A bill is not a Paddle payment (that is `billing.ts`) and not a to-do — it
 * is the rent, the water, the streaming subscription: a name, an expected
 * amount, and a rhythm. Marking one paid writes a `bill_payments` row for that
 * period recording what was *actually* paid, which may differ from what was
 * expected. That gap — expected versus paid — is the first real number a
 * finance section measures, so the payment is a row of its own rather than a
 * flag on the bill.
 *
 * A bill is archived, never deleted while it has history: its payments are the
 * point. `deleteBill` exists for one made by mistake and takes its payments
 * with it, on purpose.
 */
import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { billPayments, bills, categories, goals } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { created, stamp, stamps } from './time.js';
import { num, oneOf, optionalStr, str } from './validate.js';

export const RHYTHMS = ['weekly', 'monthly', 'yearly', 'once'] as const;
export type Rhythm = (typeof RHYTHMS)[number];

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;

export type Bill = {
	id: number;
	name: string;
	amountExpected: number;
	currency: string | null;
	dueDay: number | null;
	/** The month a yearly bill falls in, 1-12. */
	dueMonth: number | null;
	/** Days before the due day it wants paying — 0 means on the day. */
	payLeadDays: number;
	rhythm: Rhythm;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	goalId: number | null;
	notes: string;
	active: boolean;
	sortOrder: number;
};

export type BillPayment = {
	id: number;
	billId: number;
	period: string;
	amountExpected: number;
	amountPaid: number;
	currency: string | null;
	paidAt: string;
	notes: string;
};

type BillInput = {
	name: unknown;
	amountExpected?: unknown;
	currency?: unknown;
	dueDay?: unknown;
	dueMonth?: unknown;
	payLeadDays?: unknown;
	rhythm?: unknown;
	categoryId?: unknown;
	goalId?: unknown;
	notes?: unknown;
};

/** The period key a rhythm settles into for a given instant. */
export function periodFor(rhythm: Rhythm, when: Date): string {
	const y = when.getUTCFullYear();
	if (rhythm === 'yearly') return String(y);
	if (rhythm === 'once') return when.toISOString().slice(0, 10);
	if (rhythm === 'weekly') return `${isoWeekYear(when)}-W${String(isoWeek(when)).padStart(2, '0')}`;
	const m = String(when.getUTCMonth() + 1).padStart(2, '0');
	return `${y}-${m}`;
}

/** ISO-8601 week number, so a weekly bill's period is the week it fell in. */
function isoWeek(d: Date): number {
	const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	const day = (t.getUTCDay() + 6) % 7; // Mon=0
	t.setUTCDate(t.getUTCDate() - day + 3); // to the Thursday of this week
	const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
	const fday = (firstThursday.getUTCDay() + 6) % 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
	return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

function isoWeekYear(d: Date): number {
	const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	const day = (t.getUTCDay() + 6) % 7;
	t.setUTCDate(t.getUTCDate() - day + 3);
	return t.getUTCFullYear();
}

function row(r: {
	bill: typeof bills.$inferSelect;
	categoryName: string | null;
	categoryColor: string | null;
}): Bill {
	return {
		id: r.bill.id,
		name: r.bill.name,
		amountExpected: r.bill.amountExpected,
		currency: r.bill.currency,
		dueDay: r.bill.dueDay,
		dueMonth: r.bill.dueMonth,
		payLeadDays: r.bill.payLeadDays,
		rhythm: r.bill.rhythm as Rhythm,
		categoryId: r.bill.categoryId,
		categoryName: r.categoryName,
		categoryColor: r.categoryColor,
		goalId: r.bill.goalId,
		notes: r.bill.notes ?? '',
		active: r.bill.active,
		sortOrder: r.bill.sortOrder
	};
}

/** Every bill, active first, newest within each. */
export function listBills(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Bill[] {
	const where = opts.includeArchived
		? eq(bills.userId, ctx.userId)
		: and(eq(bills.userId, ctx.userId), eq(bills.active, true));
	return db
		.select({
			bill: bills,
			categoryName: categories.name,
			categoryColor: categories.color
		})
		.from(bills)
		.leftJoin(categories, eq(bills.categoryId, categories.id))
		.where(where)
		.orderBy(desc(bills.active), asc(bills.sortOrder), desc(bills.id))
		.all()
		.map(row);
}

export function getBill(ctx: Ctx, id: number): Bill {
	const found = db
		.select({
			bill: bills,
			categoryName: categories.name,
			categoryColor: categories.color
		})
		.from(bills)
		.leftJoin(categories, eq(bills.categoryId, categories.id))
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('bill');
	return row(found);
}

/** category/goal references are checked to belong to the same account. */
function ownedCategory(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'category', { int: true });
	const owned = db
		.select({ id: categories.id })
		.from(categories)
		.where(and(eq(categories.id, id), eq(categories.userId, ctx.userId)))
		.get();
	if (!owned) throw new ValidationError('That category is not yours.');
	return id;
}

function ownedGoal(ctx: Ctx, value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const id = num(value, 'goal', { int: true });
	const owned = db
		.select({ id: goals.id })
		.from(goals)
		.where(and(eq(goals.id, id), eq(goals.userId, ctx.userId)))
		.get();
	if (!owned) throw new ValidationError('That goal is not yours.');
	return id;
}

function fields(ctx: Ctx, input: BillInput) {
	return {
		name: str(input.name, 'name', { max: MAX_NAME_LENGTH }),
		amountExpected: num(input.amountExpected ?? 0, 'amount', { int: true, min: 0 }),
		currency: optionalStr(input.currency, 'currency', { max: 8 }) || null,
		// A weekly bill's "due day" is a weekday, 1-7 from Monday; every other
		// rhythm counts days of a month.
		dueDay:
			input.dueDay === undefined || input.dueDay === null || input.dueDay === ''
				? null
				: num(input.dueDay, 'due day', {
						int: true,
						min: 1,
						max: input.rhythm === 'weekly' ? 7 : 28
					}),
		dueMonth:
			input.dueMonth === undefined || input.dueMonth === null || input.dueMonth === ''
				? null
				: num(input.dueMonth, 'due month', { int: true, min: 1, max: 12 }),
		payLeadDays:
			input.payLeadDays === undefined || input.payLeadDays === null || input.payLeadDays === ''
				? 0
				: num(input.payLeadDays, 'pay lead', { int: true, min: 0, max: 27 }),
		rhythm:
			input.rhythm === undefined ? ('monthly' as Rhythm) : oneOf(input.rhythm, 'rhythm', RHYTHMS),
		categoryId: ownedCategory(ctx, input.categoryId),
		goalId: ownedGoal(ctx, input.goalId),
		notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || ''
	};
}

export function createBill(ctx: Ctx, input: BillInput): Bill {
	const f = fields(ctx, input);
	const inserted = db
		.insert(bills)
		.values({ userId: ctx.userId, ...f, ...stamps(ctx) })
		.returning({ id: bills.id })
		.get();
	return getBill(ctx, inserted.id);
}

export function updateBill(ctx: Ctx, id: number, input: BillInput): Bill {
	getBill(ctx, id); // ownership
	const f = fields(ctx, input);
	db.update(bills)
		.set({ ...f, updatedAt: stamp(ctx) })
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.run();
	return getBill(ctx, id);
}

/** Archive keeps the history; the bill leaves the active list and its funnel. */
export function setArchived(ctx: Ctx, id: number, archived: boolean): Bill {
	getBill(ctx, id);
	db.update(bills)
		.set({ active: !archived, updatedAt: stamp(ctx) })
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.run();
	return getBill(ctx, id);
}

/** For a bill created by mistake: gone, with its payments. */
export function deleteBill(ctx: Ctx, id: number): void {
	getBill(ctx, id);
	db.delete(bills)
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.run();
}

/**
 * Mark a bill paid for a period.
 *
 * The period defaults to the one the rhythm is in now, and paying the same
 * period again corrects it rather than adding a second row (the unique index
 * enforces one payment per period, so this upserts). The expected amount is
 * snapshotted from the bill as it stands, so a later edit to the bill does not
 * rewrite what was actually asked at the time.
 */
export function markPaid(
	ctx: Ctx,
	billId: number,
	input: { amountPaid?: unknown; period?: unknown; notes?: unknown } = {}
): BillPayment {
	const bill = getBill(ctx, billId);
	const period =
		input.period === undefined || input.period === ''
			? periodFor(bill.rhythm, ctx.now)
			: str(input.period, 'period', { max: 20 });
	const amountPaid =
		input.amountPaid === undefined || input.amountPaid === ''
			? bill.amountExpected
			: num(input.amountPaid, 'amount paid', { int: true, min: 0 });
	const notes = optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '';

	db.insert(billPayments)
		.values({
			userId: ctx.userId,
			billId,
			period,
			amountExpected: bill.amountExpected,
			amountPaid,
			currency: bill.currency,
			paidAt: stamp(ctx),
			...created(ctx)
		})
		.onConflictDoUpdate({
			target: [billPayments.billId, billPayments.period],
			set: { amountPaid, amountExpected: bill.amountExpected, notes, paidAt: stamp(ctx) }
		})
		.run();

	const p = db
		.select()
		.from(billPayments)
		.where(and(eq(billPayments.billId, billId), eq(billPayments.period, period)))
		.get();
	if (!p) throw new NotFoundError('bill payment');
	return payment(p);
}

/** Undo a payment for a period — it was never paid, or paid in error. */
export function unmarkPaid(ctx: Ctx, billId: number, period: string): void {
	getBill(ctx, billId); // ownership
	db.delete(billPayments)
		.where(
			and(
				eq(billPayments.userId, ctx.userId),
				eq(billPayments.billId, billId),
				eq(billPayments.period, period)
			)
		)
		.run();
}

function payment(p: typeof billPayments.$inferSelect): BillPayment {
	return {
		id: p.id,
		billId: p.billId,
		period: p.period,
		amountExpected: p.amountExpected,
		amountPaid: p.amountPaid,
		currency: p.currency,
		paidAt: p.paidAt,
		notes: p.notes ?? ''
	};
}

export function listPayments(ctx: Ctx, billId: number): BillPayment[] {
	getBill(ctx, billId); // ownership
	return db
		.select()
		.from(billPayments)
		.where(and(eq(billPayments.userId, ctx.userId), eq(billPayments.billId, billId)))
		.orderBy(desc(billPayments.period))
		.all()
		.map(payment);
}

/**
 * A month, the way the section's first page reads it: what was expected of the
 * monthly bills, what has actually been paid this month across all bills, and
 * the gap between the two.
 */
export function monthSummary(
	ctx: Ctx,
	month: string
): { expected: number; paid: number; difference: number; paidCount: number; billCount: number } {
	const active = listBills(ctx).filter((b) => b.rhythm === 'monthly');
	const expected = active.reduce((sum, b) => sum + b.amountExpected, 0);
	const paidRows = db
		.select()
		.from(billPayments)
		.where(and(eq(billPayments.userId, ctx.userId), eq(billPayments.period, month)))
		.all();
	const paid = paidRows.reduce((sum, p) => sum + p.amountPaid, 0);
	return {
		expected,
		paid,
		difference: paid - expected,
		paidCount: paidRows.length,
		billCount: active.length
	};
}

/**
 * The bills that want paying between two dates.
 *
 * A bill is not a task and does not become one — a task somebody has to keep
 * in step with the bill is two things that drift. This computes when each
 * bill wants attention instead: the due day, moved earlier by its lead, for
 * each period the range touches. The planner draws these as all-day events
 * and ticking one marks the bill paid for that period, which is the whole
 * point — the money side is a consequence of the gesture, not a second chore.
 *
 * Dates in and out are plain YYYY-MM-DD, in the account's own reckoning.
 */
export type BillDue = {
	billId: number;
	name: string;
	/** The day it should be paid — due day minus the lead. */
	date: string;
	/** The last day it can be paid. */
	dueDate: string;
	period: string;
	amountExpected: number;
	currency: string | null;
	paid: boolean;
};

function iso(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function billsDueBetween(ctx: Ctx, from: string, to: string): BillDue[] {
	// Anything with a rhythm and a day it falls on. A bill with no due day
	// never asks for the week's attention — it is a number to be paid, not an
	// appointment.
	const active = listBills(ctx).filter(
		(b) =>
			b.dueDay !== null &&
			(b.rhythm === 'monthly' || b.rhythm === 'weekly' || b.rhythm === 'yearly')
	);
	if (active.length === 0) return [];

	const paid = new Set(
		active.flatMap((b) => listPayments(ctx, b.id)).map((p) => `${p.billId}|${p.period}`)
	);

	const start = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	const out: BillDue[] = [];

	const add = (bill: Bill, due: Date) => {
		// The lead moves it earlier: the due day is the last day it can be
		// paid, this is the day it wants doing.
		const when = new Date(due.getTime() - bill.payLeadDays * 86400_000);
		if (when < start || when > end) return;
		out.push({
			billId: bill.id,
			name: bill.name,
			date: iso(when),
			dueDate: iso(due),
			period: periodFor(bill.rhythm, due),
			amountExpected: bill.amountExpected,
			currency: bill.currency,
			paid: paid.has(`${bill.id}|${periodFor(bill.rhythm, due)}`)
		});
	};

	for (const bill of active) {
		if (bill.rhythm === 'weekly') {
			// Every occurrence of that weekday in the window, plus a week of
			// slack at each end so a lead can reach in from outside it.
			const cursor = new Date(start.getTime() - 7 * 86400_000);
			const last = new Date(end.getTime() + 7 * 86400_000);
			// Monday is 1 here and 1 in the column; JS calls Sunday 0.
			while (cursor <= last) {
				const weekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
				if (weekday === bill.dueDay) add(bill, new Date(cursor));
				cursor.setUTCDate(cursor.getUTCDate() + 1);
			}
			continue;
		}

		if (bill.rhythm === 'yearly') {
			// The one date each year, from the year before the window to the
			// year after it — a lead can pull January's into December.
			for (let year = start.getUTCFullYear() - 1; year <= end.getUTCFullYear() + 1; year++) {
				add(bill, new Date(Date.UTC(year, (bill.dueMonth ?? 1) - 1, bill.dueDay!)));
			}
			continue;
		}

		// Monthly: a month wider than the window at both ends, because a lead
		// moves an occurrence backwards into the month before.
		const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
		const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 2, 1));
		while (cursor < last) {
			add(bill, new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), bill.dueDay!)));
			cursor.setUTCMonth(cursor.getUTCMonth() + 1);
		}
	}

	return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
