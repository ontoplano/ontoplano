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
 *
 * A period can also be skipped — the gym frozen for a month — which is a row
 * of its own with nothing paid, so the period reads as settled rather than
 * overdue. And a bill can be automatic, a subscription on a card: it never
 * asks to be paid, and `recordAutomaticPayments` writes its payment on each
 * due day so the history is still true.
 */
import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { billPayments, bills, categories, financeTransactions, goals } from '$lib/db/schema.js';
import { localDateOf, type Ctx } from './ctx.js';
import { NotFoundError, ValidationError } from './errors.js';
import { notebookPatch } from './notebooks.js';
import { created, instantOfLocal, stamp, stamps } from './time.js';
import { num, oneOf, optionalStr, str } from './validate.js';

export const RHYTHMS = ['weekly', 'monthly', 'yearly', 'once'] as const;
export type Rhythm = (typeof RHYTHMS)[number];

/**
 * Which way the money moves. Income is recorded exactly the way bills are —
 * same table, same rhythms, same one-payment-per-period — so every function
 * here takes the direction rather than assuming it. The default is 'out'
 * everywhere, which is what keeps the planner, the dashboard and the
 * reminders talking about bills and nothing else.
 */
export const FLOWS = ['in', 'out'] as const;
export type Flow = (typeof FLOWS)[number];

/** What happened to a period: paid, or skipped on purpose. */
export const PAYMENT_STATUSES = ['paid', 'skipped'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const MAX_NAME_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;

/**
 * How far back automatic payments are caught up in one go.
 *
 * The mark moves every time bills are read, so this only matters for an
 * account nobody opened for a long while; it keeps that one read bounded.
 */
const MAX_AUTOMATIC_CATCH_UP_DAYS = 400;

/** The wall-clock time an automatic payment is stamped at, on its due day. */
const AUTOMATIC_PAID_AT_TIME = '12:00';

/** The due day an automatic bill with none is recorded on: the 1st, or Monday. */
const AUTOMATIC_DEFAULT_DUE_DAY = 1;

const DAY_MS = 86400_000;

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
	/** Paid without anybody doing it: never reminded, recorded on the due day. */
	automatic: boolean;
	rhythm: Rhythm;
	flow: Flow;
	categoryId: number | null;
	categoryName: string | null;
	categoryColor: string | null;
	goalId: number | null;
	notes: string;
	active: boolean;
	sortOrder: number;
	/** The subject it belongs to, if any. */
	notebookId: number | null;
};

export type BillPayment = {
	id: number;
	billId: number;
	period: string;
	amountExpected: number;
	amountPaid: number;
	/** Paid, or skipped on purpose — a skip pays nothing. */
	status: PaymentStatus;
	/** Written by the app on the due day of an automatic bill. */
	automatic: boolean;
	currency: string | null;
	paidAt: string;
	notes: string;
	/** The statement line this payment is, when it was attached to one. */
	movementId: number | null;
};

type BillInput = {
	name: unknown;
	amountExpected?: unknown;
	currency?: unknown;
	dueDay?: unknown;
	dueMonth?: unknown;
	payLeadDays?: unknown;
	automatic?: unknown;
	rhythm?: unknown;
	flow?: unknown;
	categoryId?: unknown;
	goalId?: unknown;
	notes?: unknown;
	/** The subject it belongs to, when it is part of one. */
	notebookId?: unknown;
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
		automatic: r.bill.automatic,
		rhythm: r.bill.rhythm as Rhythm,
		flow: r.bill.flow as Flow,
		categoryId: r.bill.categoryId,
		categoryName: r.categoryName,
		categoryColor: r.categoryColor,
		goalId: r.bill.goalId,
		notes: r.bill.notes ?? '',
		active: r.bill.active,
		sortOrder: r.bill.sortOrder,
		notebookId: r.bill.notebookId
	};
}

/**
 * Every bill, active first, newest within each — or one subject's.
 *
 * `notebookId` narrows rather than changing the shape: a notebook's Bills tab
 * is this room looking at one subject and draws the rows with the same
 * component, so it needs exactly what the room needs.
 */
export function listBills(
	ctx: Ctx,
	opts: { includeArchived?: boolean; flow?: Flow; notebookId?: number } = {}
): Bill[] {
	const where = and(
		eq(bills.userId, ctx.userId),
		eq(bills.flow, opts.flow ?? 'out'),
		opts.includeArchived ? undefined : eq(bills.active, true),
		opts.notebookId === undefined ? undefined : eq(bills.notebookId, opts.notebookId)
	);
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

/** What a bill has cost so far, and what one period of it costs on average. */
export type BillHistory = {
	/** Newest period first, paid and skipped alike. */
	entries: BillPayment[];
	paidCount: number;
	skippedCount: number;
	totalPaid: number;
	/** The mean of what was paid, over the periods that were paid. Null before any. */
	averagePaid: number | null;
};

/** The numbers under a bill's history, from its rows. */
export function summariseHistory(entries: BillPayment[]): BillHistory {
	const paid = entries.filter((entry) => entry.status === 'paid');
	const totalPaid = paid.reduce((sum, entry) => sum + entry.amountPaid, 0);
	return {
		entries,
		paidCount: paid.length,
		skippedCount: entries.length - paid.length,
		totalPaid,
		averagePaid: paid.length === 0 ? null : Math.round(totalPaid / paid.length)
	};
}

/** One bill's history, with automatic payments caught up first. */
export function billHistory(ctx: Ctx, billId: number): BillHistory {
	recordAutomaticPayments(ctx);
	return summariseHistory(listPayments(ctx, billId));
}

/**
 * The bills, each saying which period it is in and how that one was settled.
 *
 * The Finance room worked this out in its own `load`, so anywhere else that
 * showed a bill — a notebook's Bills tab — had the row without the two things
 * the row is about: which period the tick would pay, and whether it is already
 * paid. A row drawn without them offers to pay a bill that is paid. The
 * history rides along because the row expands into it, on both screens.
 */
export function listBillsThisPeriod(
	ctx: Ctx,
	opts: { includeArchived?: boolean; flow?: Flow; notebookId?: number } = {}
): (Bill & {
	period: string;
	paidThisPeriod: boolean;
	skippedThisPeriod: boolean;
	history: BillHistory;
})[] {
	recordAutomaticPayments(ctx);
	return listBills(ctx, opts).map((bill) => {
		const period = periodFor(bill.rhythm, ctx.now);
		const entries = listPayments(ctx, bill.id);
		const settled = entries.find((payment) => payment.period === period);
		return {
			...bill,
			period,
			paidThisPeriod: settled?.status === 'paid',
			skippedThisPeriod: settled?.status === 'skipped',
			history: summariseHistory(entries)
		};
	});
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
	if (!owned) throw new ValidationError({ key: 'errors.bills.thatCategoryIsNotYours' });
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
	if (!owned) throw new ValidationError({ key: 'errors.bills.thatGoalIsNotYours' });
	return id;
}

/** A checkbox, a JSON boolean or a word — true only when it says so. */
function flag(value: unknown): boolean {
	return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function fields(ctx: Ctx, input: BillInput, id?: number) {
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
		automatic: flag(input.automatic),
		rhythm:
			input.rhythm === undefined ? ('monthly' as Rhythm) : oneOf(input.rhythm, 'rhythm', RHYTHMS),
		flow: input.flow === undefined ? ('out' as Flow) : oneOf(input.flow, 'flow', FLOWS),
		categoryId: ownedCategory(ctx, input.categoryId),
		goalId: ownedGoal(ctx, input.goalId),
		notes: optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '',
		// Only when the caller mentioned it — see `notebookPatch`.
		...notebookPatch(ctx, input, 'bills', id === undefined ? undefined : { table: bills, id })
	};
}

/**
 * Where automatic recording starts: today, when a bill becomes automatic.
 *
 * Not from the bill's beginning — somebody ticking the box has not said the
 * months before it were paid — and cleared when it stops being automatic, so
 * turning it on again starts fresh rather than filling the gap.
 */
function settleMark(ctx: Ctx, was: boolean, is: boolean, mark: string | null): string | null {
	if (!is) return null;
	if (was && mark) return mark;
	return localDateOf(ctx.now, ctx.tz);
}

export function createBill(ctx: Ctx, input: BillInput): Bill {
	const f = fields(ctx, input);
	const inserted = db
		.insert(bills)
		.values({
			userId: ctx.userId,
			...f,
			settledThrough: settleMark(ctx, false, f.automatic, null),
			...stamps(ctx)
		})
		.returning({ id: bills.id })
		.get();
	return getBill(ctx, inserted.id);
}

export function updateBill(ctx: Ctx, id: number, input: BillInput): Bill {
	const before = markOf(ctx, id); // ownership
	const f = fields(ctx, input, id);
	db.update(bills)
		.set({
			...f,
			settledThrough: settleMark(ctx, before.automatic, f.automatic, before.settledThrough),
			updatedAt: stamp(ctx)
		})
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.run();
	return getBill(ctx, id);
}

/** A bill's automatic flag and mark, or not found. */
function markOf(ctx: Ctx, id: number): { automatic: boolean; settledThrough: string | null } {
	const found = db
		.select({ automatic: bills.automatic, settledThrough: bills.settledThrough })
		.from(bills)
		.where(and(eq(bills.id, id), eq(bills.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('bill');
	return found;
}

/**
 * Archive keeps the history; the bill leaves the active list and its funnel.
 *
 * Bringing an automatic one back starts its recording from today: the time it
 * spent put away was not paid, and catching up across it would say it was.
 */
export function setArchived(ctx: Ctx, id: number, archived: boolean): Bill {
	const before = markOf(ctx, id);
	db.update(bills)
		.set({
			active: !archived,
			...(!archived && before.automatic ? { settledThrough: localDateOf(ctx.now, ctx.tz) } : {}),
			updatedAt: stamp(ctx)
		})
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
	input: { amountPaid?: unknown; period?: unknown; notes?: unknown; movementId?: unknown } = {}
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
	const movementId =
		input.movementId === undefined || input.movementId === null || input.movementId === ''
			? null
			: ownedMovement(ctx, num(input.movementId, 'movement', { int: true, min: 1 }));

	db.insert(billPayments)
		.values({
			userId: ctx.userId,
			billId,
			period,
			amountExpected: bill.amountExpected,
			amountPaid,
			status: 'paid',
			currency: bill.currency,
			movementId,
			notes,
			paidAt: stamp(ctx),
			...created(ctx)
		})
		.onConflictDoUpdate({
			target: [billPayments.billId, billPayments.period],
			// Paying a skipped period turns the skip into a payment: it was paid
			// after all, and that is the fact worth keeping.
			set: {
				amountPaid,
				amountExpected: bill.amountExpected,
				status: 'paid',
				automatic: false,
				notes,
				movementId,
				paidAt: stamp(ctx)
			}
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

/**
 * A statement line of this account's own, or nothing.
 *
 * Checked rather than trusted: a bill payment carrying somebody else's
 * transaction id would report their money as yours, and the id arrives from a
 * form.
 */
function ownedMovement(ctx: Ctx, movementId: number): number {
	const found = db
		.select({ id: financeTransactions.id })
		.from(financeTransactions)
		.where(and(eq(financeTransactions.id, movementId), eq(financeTransactions.userId, ctx.userId)))
		.get();
	if (!found) throw new NotFoundError('movement');
	return found.id;
}

/**
 * Mark a bill paid by pointing at the line that paid it.
 *
 * The amount comes from the statement rather than from what was expected,
 * which is the whole point: the gap between the two is the number this room
 * exists to show, and typing it in by hand is how that number becomes fiction.
 * Money out is negative in a ledger and a payment is a positive amount, so the
 * sign is dropped.
 */
export function markPaidFromMovement(
	ctx: Ctx,
	billId: number,
	movementId: unknown,
	period?: unknown
): BillPayment {
	const id = ownedMovement(ctx, num(movementId, 'movement', { int: true, min: 1 }));
	const line = db
		.select({ amountCents: financeTransactions.amountCents })
		.from(financeTransactions)
		.where(eq(financeTransactions.id, id))
		.get();
	if (!line) throw new NotFoundError('movement');

	return markPaid(ctx, billId, {
		amountPaid: Math.abs(line.amountCents),
		movementId: id,
		period
	});
}

/** Undo a payment for a period — it was never paid, or paid in error. */
export function unmarkPaid(ctx: Ctx, billId: number, period: string): void {
	getBill(ctx, billId); // ownership
	db.delete(billPayments)
		.where(
			and(
				eq(billPayments.userId, ctx.userId),
				eq(billPayments.billId, billId),
				eq(billPayments.period, period),
				eq(billPayments.status, 'paid')
			)
		)
		.run();
}

/**
 * Say a period was skipped on purpose — nothing was owed, nothing was paid.
 *
 * Refused on a period that is paid: replacing a payment with a skip would lose
 * what was paid, and undoing the payment first is one press.
 */
export function skipPeriod(
	ctx: Ctx,
	billId: number,
	input: { period?: unknown; notes?: unknown } = {}
): BillPayment {
	const bill = getBill(ctx, billId);
	const period =
		input.period === undefined || input.period === '' || input.period === null
			? periodFor(bill.rhythm, ctx.now)
			: str(input.period, 'period', { max: 20 });
	const notes = optionalStr(input.notes, 'notes', { max: MAX_NOTE_LENGTH }) || '';

	const existing = db
		.select({ status: billPayments.status })
		.from(billPayments)
		.where(
			and(
				eq(billPayments.userId, ctx.userId),
				eq(billPayments.billId, billId),
				eq(billPayments.period, period)
			)
		)
		.get();
	if (existing?.status === 'paid')
		throw new ValidationError({ key: 'errors.bills.thatPeriodIsAlreadyPaid' });

	db.insert(billPayments)
		.values({
			userId: ctx.userId,
			billId,
			period,
			amountExpected: bill.amountExpected,
			amountPaid: 0,
			status: 'skipped',
			currency: bill.currency,
			notes,
			paidAt: stamp(ctx),
			...created(ctx)
		})
		.onConflictDoUpdate({
			target: [billPayments.billId, billPayments.period],
			set: { notes, paidAt: stamp(ctx) }
		})
		.run();

	const p = db
		.select()
		.from(billPayments)
		.where(
			and(
				eq(billPayments.userId, ctx.userId),
				eq(billPayments.billId, billId),
				eq(billPayments.period, period)
			)
		)
		.get();
	if (!p) throw new NotFoundError('bill payment');
	return payment(p);
}

/** Take a skip back — the period is open again. The inverse of `skipPeriod`. */
export function unskipPeriod(ctx: Ctx, billId: number, period: string): void {
	getBill(ctx, billId); // ownership
	db.delete(billPayments)
		.where(
			and(
				eq(billPayments.userId, ctx.userId),
				eq(billPayments.billId, billId),
				eq(billPayments.period, period),
				eq(billPayments.status, 'skipped')
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
		status: p.status as PaymentStatus,
		automatic: p.automatic,
		currency: p.currency,
		paidAt: p.paidAt,
		notes: p.notes ?? '',
		movementId: p.movementId ?? null
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
 * the gap between the two. A monthly bill skipped this month expected nothing.
 */
export function monthSummary(
	ctx: Ctx,
	month: string,
	flow: Flow = 'out'
): { expected: number; paid: number; difference: number; paidCount: number; billCount: number } {
	recordAutomaticPayments(ctx);
	const rows = db
		.select({ payment: billPayments })
		.from(billPayments)
		.innerJoin(bills, eq(billPayments.billId, bills.id))
		.where(
			and(eq(billPayments.userId, ctx.userId), eq(billPayments.period, month), eq(bills.flow, flow))
		)
		.all()
		.map((r) => r.payment);
	const skipped = new Set(rows.filter((p) => p.status === 'skipped').map((p) => p.billId));
	const active = listBills(ctx, { flow }).filter(
		(b) => b.rhythm === 'monthly' && !skipped.has(b.id)
	);
	const expected = active.reduce((sum, b) => sum + b.amountExpected, 0);
	const paidRows = rows.filter((p) => p.status === 'paid');
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

/** A civil date moved by whole days. */
function shift(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Every day a bill falls due between two UTC midnights, both included.
 *
 * The due day itself, not the day it wants paying — the lead is the caller's
 * to apply. A one-off has no rhythm and so no occurrences.
 */
function dueDatesBetween(
	bill: Pick<Bill, 'rhythm' | 'dueDay' | 'dueMonth'>,
	start: Date,
	end: Date
): Date[] {
	const out: Date[] = [];
	const dueDay = bill.dueDay;
	if (dueDay === null || start > end) return out;

	if (bill.rhythm === 'weekly') {
		// Monday is 1 here and 1 in the column; JS calls Sunday 0.
		for (let cursor = new Date(start); cursor <= end; cursor = shift(cursor, 1)) {
			const weekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
			if (weekday === dueDay) out.push(cursor);
		}
		return out;
	}

	if (bill.rhythm === 'yearly') {
		for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year++) {
			const due = new Date(Date.UTC(year, (bill.dueMonth ?? 1) - 1, dueDay));
			if (due >= start && due <= end) out.push(due);
		}
		return out;
	}

	if (bill.rhythm === 'monthly') {
		const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
		while (cursor <= end) {
			const due = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), dueDay));
			if (due >= start && due <= end) out.push(due);
			cursor.setUTCMonth(cursor.getUTCMonth() + 1);
		}
	}
	return out;
}

/**
 * Write the payments automatic bills have made since they were last looked at.
 *
 * A subscription on a card is paid whether or not anybody says so, so its
 * history is written for it: one payment per due day that has come, for the
 * expected amount, marked as the app's rather than a person's. From the bill's
 * mark forward only, and the mark moves to today — so a payment somebody undid
 * stays undone, and a period already paid or skipped by hand is left alone.
 *
 * Called by every read that shows a bill's settled state, so the device
 * instance, which has no job running in the background, is as true as the
 * server. Idempotent: calling it twice in a day writes nothing the second time.
 */
export function recordAutomaticPayments(ctx: Ctx): number {
	const today = localDateOf(ctx.now, ctx.tz);
	const due = db
		.select()
		.from(bills)
		.where(and(eq(bills.userId, ctx.userId), eq(bills.automatic, true), eq(bills.active, true)))
		.all();

	let written = 0;
	const end = new Date(`${today}T00:00:00Z`);
	const earliest = shift(end, -MAX_AUTOMATIC_CATCH_UP_DAYS);

	for (const bill of due) {
		const mark = bill.settledThrough ?? today;
		if (mark < today && bill.rhythm !== 'once') {
			const from = shift(new Date(`${mark}T00:00:00Z`), 1);
			const start = from < earliest ? earliest : from;
			const rhythm = bill.rhythm as Rhythm;
			const days = dueDatesBetween(
				{ rhythm, dueDay: bill.dueDay ?? AUTOMATIC_DEFAULT_DUE_DAY, dueMonth: bill.dueMonth },
				start,
				end
			);
			for (const day of days) {
				const result = db
					.insert(billPayments)
					.values({
						userId: ctx.userId,
						billId: bill.id,
						period: periodFor(rhythm, day),
						amountExpected: bill.amountExpected,
						amountPaid: bill.amountExpected,
						status: 'paid',
						automatic: true,
						currency: bill.currency,
						paidAt: instantOfLocal(`${iso(day)}T${AUTOMATIC_PAID_AT_TIME}`, ctx.tz).toISOString(),
						...created(ctx)
					})
					.onConflictDoNothing()
					.run();
				written += result.changes;
			}
		}
		if (bill.settledThrough !== today) {
			db.update(bills)
				.set({ settledThrough: today })
				.where(and(eq(bills.id, bill.id), eq(bills.userId, ctx.userId)))
				.run();
		}
	}
	return written;
}

export function billsDueBetween(ctx: Ctx, from: string, to: string): BillDue[] {
	// Anything with a rhythm and a day it falls on. A bill with no due day
	// never asks for the week's attention — it is a number to be paid, not an
	// appointment. Nor does an automatic one: it pays itself.
	const active = listBills(ctx).filter(
		(b) =>
			b.dueDay !== null &&
			!b.automatic &&
			(b.rhythm === 'monthly' || b.rhythm === 'weekly' || b.rhythm === 'yearly')
	);
	if (active.length === 0) return [];

	const settled = new Map(
		active
			.flatMap((b) => listPayments(ctx, b.id))
			.map((p) => [`${p.billId}|${p.period}`, p.status] as const)
	);

	const start = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	const out: BillDue[] = [];

	for (const bill of active) {
		// The lead moves each occurrence earlier: the due day is the last day
		// it can be paid, the day it wants doing is that many before. So the
		// due days that land in the window are the window moved later by it.
		for (const due of dueDatesBetween(
			bill,
			shift(start, bill.payLeadDays),
			shift(end, bill.payLeadDays)
		)) {
			const period = periodFor(bill.rhythm, due);
			const status = settled.get(`${bill.id}|${period}`);
			// A skipped period wants nothing: it is not on the week at all.
			if (status === 'skipped') continue;
			out.push({
				billId: bill.id,
				name: bill.name,
				date: iso(shift(due, -bill.payLeadDays)),
				dueDate: iso(due),
				period,
				amountExpected: bill.amountExpected,
				currency: bill.currency,
				paid: status === 'paid'
			});
		}
	}

	return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
