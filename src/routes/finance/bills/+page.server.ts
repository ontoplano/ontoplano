import type { Actions, PageServerLoad } from './$types';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { getCurrency } from '$lib/server/settings';
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
	type Rhythm
} from '$lib/server/services/bills';

function thisMonth(now: Date): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const currency = getCurrency(ctx.userId);
	const bills = listBills(ctx, { includeArchived: true });
	const month = thisMonth(ctx.now);

	// The period each bill is in now — weekly bills are in this week, monthly in
	// this month — so a row can say paid/unpaid for its own cadence, not the
	// month's.
	const periods = Object.fromEntries(
		bills.map((b) => [b.id, periodFor(b.rhythm as Rhythm, ctx.now)])
	);
	// Which bills already have a payment for their current period.
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
		summary: monthSummary(ctx, month),
		periods
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			createBill(ctx, {
				name: form.get('heading'),
				amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
				rhythm: form.get('rhythm') || 'monthly',
				dueDay: form.get('dueDay') || null,
				notes: form.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			updateBill(ctx, Number(form.get('id')), {
				name: form.get('heading'),
				amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
				rhythm: form.get('rhythm') || 'monthly',
				dueDay: form.get('dueDay') || null,
				notes: form.get('notes')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	pay: async ({ request, locals }) => {
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

	unpay: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			unmarkPaid(buildCtx(locals.user!.id), Number(form.get('id')), String(form.get('period')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	archive: async ({ request, locals }) => {
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

	delete: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			deleteBill(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
