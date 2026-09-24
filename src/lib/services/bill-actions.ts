import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { parseMoney } from '$lib/money';
import { getCurrency } from '$lib/services/settings';
import {
	createBill,
	deleteBill,
	markPaid,
	markPaidFromMovement,
	setArchived,
	unmarkPaid,
	updateBill
} from '$lib/services/bills';

/**
 * Everything that can be done to a bill, wherever the row is on screen.
 *
 * The Finance room shows every bill; a notebook shows the ones filed under its
 * subject — the architect's fee, the skip hire — and paying one there has to
 * mean the same thing. The notebook mounts these under a prefix; see
 * `$lib/bill-action-names` for the names each screen posts to.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const billHandlers = {
	create: async ({ request, locals }: Event) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			createBill(ctx, {
				name: form.get('heading'),
				amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
				rhythm: form.get('rhythm') || 'monthly',
				dueDay: form.get('dueDay') || null,
				dueMonth: form.get('dueMonth') || null,
				payLeadDays: form.get('payLeadDays') || 0,
				notes: form.get('notes'),
				// `has` rather than `get`: the room's form says nothing about a
				// notebook and must not be read as taking the bill out of one.
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			updateBill(ctx, Number(form.get('id')), {
				name: form.get('heading'),
				amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
				rhythm: form.get('rhythm') || 'monthly',
				dueDay: form.get('dueDay') || null,
				dueMonth: form.get('dueMonth') || null,
				payLeadDays: form.get('payLeadDays') || 0,
				notes: form.get('notes'),
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	pay: async ({ request, locals }: Event) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			const paid = form.get('amount');
			markPaid(ctx, Number(form.get('id')), {
				amountPaid: paid ? (parseMoney(paid, getCurrency(ctx.userId)) ?? undefined) : undefined,
				period: form.get('period') || undefined
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/*
	 * Paid, and here is the line that paid it.
	 *
	 * The amount comes from the statement rather than from what the bill
	 * expected — the gap between the two is the number this room exists to
	 * show, and typing it in by hand is how that number becomes fiction.
	 */
	payFromMovement: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			markPaidFromMovement(
				buildCtx(locals.user!.id),
				Number(form.get('id')),
				form.get('movementId'),
				form.get('period') || undefined
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	unpay: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			unmarkPaid(buildCtx(locals.user!.id), Number(form.get('id')), String(form.get('period')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Archive keeps the history; the bill leaves the active list and its funnel. */
	archive: async ({ request, locals }: Event) => {
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

	delete: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			deleteBill(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
