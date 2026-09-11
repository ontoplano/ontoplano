/**
 * Bills and income are one mechanism pointed two ways.
 *
 * Both tabs load and mutate through this factory, differing only in the
 * `flow` they pin — so a fix to how a payment is recorded, or a field added
 * to the form, lands on both sides at once instead of drifting apart. The
 * page markup is shared the same way, in
 * `$lib/components/MoneyFlows.svelte`.
 */
import type { SelfContainedEvent } from '$lib/self-contained/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { getCurrency } from '$lib/services/settings';
import { parseMoney } from '$lib/money';
import {
	createBill,
	updateBill,
	setArchived,
	deleteBill,
	markPaid,
	unmarkPaid,
	listBills,
	listPayments,
	monthSummary,
	periodFor,
	type Flow,
	type Rhythm
} from '$lib/services/bills';

function thisMonth(now: Date): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function flowLoad(flow: Flow) {
	return async ({ locals }: SelfContainedEvent) => {
		const ctx = buildCtx(locals.user!.id);
		const currency = getCurrency(ctx.userId);
		const bills = listBills(ctx, { includeArchived: true, flow });
		const month = thisMonth(ctx.now);

		// The period each entry is in now — weekly ones are in this week,
		// monthly in this month — so a row can say paid/unpaid for its own
		// cadence, not the month's.
		const periods = Object.fromEntries(
			bills.map((b) => [b.id, periodFor(b.rhythm as Rhythm, ctx.now)])
		);
		// Which entries already have a payment for their current period.
		const paid = new Set(
			bills
				.flatMap((b) => listPayments(ctx, b.id))
				.filter((p) => p.period === periods[p.billId])
				.map((p) => p.billId)
		);

		return {
			currency,
			month,
			bills: bills.map((b) => ({ ...b, paidThisPeriod: paid.has(b.id), period: periods[b.id] })),
			summary: monthSummary(ctx, month, flow),
			periods
		};
	};
}

/** What either tab's page receives — the component types itself with this. */
export type FlowPageData = Awaited<ReturnType<ReturnType<typeof flowLoad>>>;

export function flowActions(flow: Flow) {
	return {
		create: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			const ctx = buildCtx(locals.user!.id);
			try {
				createBill(ctx, {
					name: form.get('heading'),
					amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
					rhythm: form.get('rhythm') || 'monthly',
					flow,
					dueDay: form.get('dueDay') || null,
					dueMonth: form.get('dueMonth') || null,
					payLeadDays: form.get('payLeadDays') || 0,
					notes: form.get('notes')
				});
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		},

		update: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			const ctx = buildCtx(locals.user!.id);
			try {
				updateBill(ctx, Number(form.get('id')), {
					name: form.get('heading'),
					amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
					rhythm: form.get('rhythm') || 'monthly',
					flow,
					dueDay: form.get('dueDay') || null,
					dueMonth: form.get('dueMonth') || null,
					payLeadDays: form.get('payLeadDays') || 0,
					notes: form.get('notes')
				});
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		},

		pay: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			const ctx = buildCtx(locals.user!.id);
			try {
				const paid = form.get('amount');
				markPaid(ctx, Number(form.get('id')), {
					// Blank means "the expected amount" — the service fills it in.
					amountPaid: paid ? (parseMoney(paid, getCurrency(ctx.userId)) ?? undefined) : undefined,
					period: form.get('period') || undefined
				});
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		},

		unpay: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			try {
				unmarkPaid(buildCtx(locals.user!.id), Number(form.get('id')), String(form.get('period')));
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		},

		archive: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			try {
				setArchived(
					buildCtx(locals.user!.id),
					Number(form.get('id')),
					form.get('archived') === 'true'
				);
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		},

		delete: async ({ request, locals }: SelfContainedEvent) => {
			const form = await request.formData();
			try {
				deleteBill(buildCtx(locals.user!.id), Number(form.get('id')));
				return { success: true };
			} catch (e) {
				return toActionFailure(e);
			}
		}
	};
}
