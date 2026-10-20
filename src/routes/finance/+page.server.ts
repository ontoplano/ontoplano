import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { moneyOverview } from '$lib/services/finance-summary';
import { getCurrency, getMoneyView, isMoneyView, setMoneyView } from '$lib/services/settings';
import { monthParam } from '$lib/when';

/**
 * The money picture.
 *
 * One month at a time, every original currency separately. The month is the
 * one asked for; with none, the account's own current month, not the box's.
 *
 * `view` chooses whether the totals include money held for other people. It is
 * a query when a link asks for one mode, and the account's stored answer
 * otherwise — the switch on the screen writes that answer.
 */
export const load = ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const asked = url.searchParams.get('view');
	return {
		overview: moneyOverview(ctx, { month: monthParam(url.searchParams.get('month')) }),
		// Legacy ledgers without a declared currency are still readable: amounts
		// are formatted in the account's own currency, labelled as not a total.
		defaultCurrency: getCurrency(ctx.userId),
		view: isMoneyView(asked) ? asked : getMoneyView(ctx.userId)
	};
};

export const actions: Actions = {
	setView: async ({ locals, request }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		const asked = String(form.get('view') ?? '');
		const view = isMoneyView(asked) ? asked : 'all';
		setMoneyView(ctx.userId, view);
		const rawMonth = form.get('month');
		const month = monthParam(typeof rawMonth === 'string' ? rawMonth : null);
		redirect(303, month ? `/finance?month=${month}` : '/finance');
	}
};
