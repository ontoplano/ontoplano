import type { Actions } from '@sveltejs/kit';
import { parseMoney } from '$lib/money';
import { getCurrency } from '$lib/services/settings';
import { formAction } from '$lib/services/scoped-actions';
import {
	createBill,
	deleteBill,
	markPaid,
	markPaidFromMovement,
	setArchived,
	skipPeriod,
	unmarkPaid,
	unskipPeriod,
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
export const billHandlers = {
	create: formAction((ctx, form) => {
		createBill(ctx, {
			name: form.get('heading'),
			amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
			rhythm: form.get('rhythm') || 'monthly',
			dueDay: form.get('dueDay') || null,
			dueMonth: form.get('dueMonth') || null,
			payLeadDays: form.get('payLeadDays') || 0,
			// A checkbox: present when ticked, absent when not.
			automatic: form.has('automatic'),
			notes: form.get('notes'),
			// `has` rather than `get`: the room's form says nothing about a
			// notebook and must not be read as taking the bill out of one.
			...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
		});
	}),

	update: formAction((ctx, form) => {
		updateBill(ctx, Number(form.get('id')), {
			name: form.get('heading'),
			amountExpected: parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0,
			rhythm: form.get('rhythm') || 'monthly',
			dueDay: form.get('dueDay') || null,
			dueMonth: form.get('dueMonth') || null,
			payLeadDays: form.get('payLeadDays') || 0,
			// A checkbox: present when ticked, absent when not.
			automatic: form.has('automatic'),
			notes: form.get('notes'),
			...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
		});
	}),

	pay: formAction((ctx, form) => {
		const paid = form.get('amount');
		markPaid(ctx, Number(form.get('id')), {
			amountPaid: paid ? (parseMoney(paid, getCurrency(ctx.userId)) ?? undefined) : undefined,
			period: form.get('period') || undefined
		});
	}),

	/*
	 * Paid, and here is the line that paid it.
	 *
	 * The amount comes from the statement rather than from what the bill
	 * expected — the gap between the two is the number this room exists to
	 * show, and typing it in by hand is how that number becomes fiction.
	 */
	payFromMovement: formAction((ctx, form) => {
		markPaidFromMovement(
			ctx,
			Number(form.get('id')),
			form.get('movementId'),
			form.get('period') || undefined
		);
	}),

	unpay: formAction((ctx, form) => {
		unmarkPaid(ctx, Number(form.get('id')), String(form.get('period')));
	}),

	/** Nothing was owed this period: settled without a payment. */
	skip: formAction((ctx, form) => {
		skipPeriod(ctx, Number(form.get('id')), {
			period: form.get('period') || undefined
		});
	}),

	unskip: formAction((ctx, form) => {
		unskipPeriod(ctx, Number(form.get('id')), String(form.get('period')));
	}),

	/** Archive keeps the history; the bill leaves the active list and its funnel. */
	archive: formAction((ctx, form) => {
		setArchived(ctx, Number(form.get('id')), form.get('archived') === 'true');
	}),

	delete: formAction((ctx, form) => {
		deleteBill(ctx, Number(form.get('id')));
	})
} satisfies Actions;
