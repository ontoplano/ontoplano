import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { billHandlers } from '$lib/services/bill-actions';
import { getCurrency } from '$lib/services/settings';
import { listMovements } from '$lib/services/statements';
import { listBills, listPayments, monthSummary, periodFor, type Rhythm } from '$lib/services/bills';

/**
 * Bills are not the finance section any more — transactions are, and they
 * come from the bank rather than from a form. What a bill still is: a thing
 * that wants paying on a day, which is why it rides the week and the
 * reminders. So the page stays, reachable from Ledgers, and the money it
 * describes is the money the statements will show arriving and leaving.
 */
function thisMonth(now: Date): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * How far back the "which line paid this?" picker looks, and how much of it.
 *
 * A bill is paid near when it is due, so six weeks covers a monthly one that
 * went out late without turning the picker into the whole statement.
 */
const MOVEMENT_PICKER_DAYS = 45;
const MOVEMENT_PICKER_LIMIT = 200;

export const load = async ({ locals }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const bills = listBills(ctx, { includeArchived: true });
	const month = thisMonth(ctx.now);
	const periods = Object.fromEntries(
		bills.map((b) => [b.id, periodFor(b.rhythm as Rhythm, ctx.now)])
	);
	const paid = new Set(
		bills
			.flatMap((b) => listPayments(ctx, b.id))
			.filter((p) => p.period === periods[p.billId])
			.map((p) => p.billId)
	);

	/*
	 * Recent money leaving, to attach a bill to.
	 *
	 * The whole list would be thousands of lines and a picker nobody scrolls;
	 * a bill is paid near when it is due, so the last few weeks is where the
	 * line actually is. Out only: a bill is money leaving.
	 */
	const since = new Date(ctx.now);
	since.setDate(since.getDate() - MOVEMENT_PICKER_DAYS);

	return {
		currency: getCurrency(ctx.userId),
		month,
		bills: bills.map((b) => ({ ...b, paidThisPeriod: paid.has(b.id), period: periods[b.id] })),
		summary: monthSummary(ctx, month),
		periods,
		recentMovements: listMovements(ctx, {
			from: since.toISOString().slice(0, 10),
			direction: 'out',
			limit: MOVEMENT_PICKER_LIMIT
		})
	};
};

/*
 * The room's own names for the room's own handlers.
 *
 * The same handlers answer inside a notebook under a prefix — see
 * `$lib/services/bill-actions`, which is where they live so paying a bill from
 * a notebook and paying it here are the same code.
 */
export const actions = billHandlers;
