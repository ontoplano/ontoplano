import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx, localDateOf } from '$lib/services/ctx';
import { formAction } from '$lib/services/scoped-actions';
import { redirect } from '@sveltejs/kit';
import { normaliseCurrency, parseSignedMoney } from '$lib/money';
import { ValidationError } from '$lib/services/errors';
import { getCurrency } from '$lib/services/settings';
import { listLedgers } from '$lib/services/ledgers';
import { createRule, filterOptions } from '$lib/services/statements';
import {
	listBudgets,
	getBudget,
	createBudget,
	updateBudget,
	deleteBudget,
	copyBudgets
} from '$lib/services/budgets.js';
import { budgetMonth } from '$lib/services/budgets.js';
import { monthParam } from '$lib/when';

/** The month before a `YYYY-MM` key, without going through a Date. */
function previousMonthOf(month: string): string {
	const [year, number] = month.split('-').map(Number);
	return number === 1
		? `${String((year ?? 1) - 1).padStart(4, '0')}-12`
		: `${year}-${String((number ?? 1) - 1).padStart(2, '0')}`;
}

export const load = ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const currentMonth = localDateOf(ctx.now, ctx.tz).slice(0, 7);
	const requestedMonth = url.searchParams.get('month');
	const month = budgetMonth(monthParam(requestedMonth) ?? currentMonth);
	// A hand-edited `?currency=ZZZ` is ignored, not a 500; the GET form only
	// offers real ones, so this is only ever somebody in the address bar.
	const rawCurrency = url.searchParams.get('currency') ?? '';
	const requestedCurrency = rawCurrency ? (normaliseCurrency(rawCurrency) ?? '') : '';

	const budgets = listBudgets(ctx, {
		month,
		currency: requestedCurrency || undefined
	});

	const options = filterOptions(ctx);
	const ledgers = listLedgers(ctx, { includeArchived: true });
	// Budgets can only be spent against a currency some ledger actually holds.
	// The account's display currency is not enough: a legacy ledger with no
	// declared currency cannot back a budget in it.
	const currencies = [
		...new Set(
			ledgers
				.map((ledger) => ledger.currency)
				.filter((currency): currency is string => currency !== null)
		)
	];
	const defaultCurrency = currencies[0] ?? getCurrency(ctx.userId);
	const previousMonth = previousMonthOf(month);
	const previousCount = listBudgets(ctx, { month: previousMonth }).length;

	return {
		month,
		currency: requestedCurrency,
		defaultCurrency,
		currencies,
		categories: options.categories.map((category) => category.name),
		budgets,
		previousMonth,
		previousCount
	};
};

function amount(raw: unknown, currency: string) {
	const value = parseSignedMoney(raw, currency);
	if (value === null)
		throw new ValidationError('Enter an exact budget amount in its original currency.');
	return value;
}

export const actions = {
	create: formAction((ctx, form) => {
		const budget = createBudget(ctx, {
			month: form.get('month'),
			category: form.get('category'),
			currency: form.get('currency'),
			amountMinor: amount(form.get('amount'), String(form.get('currency') ?? ''))
		});
		// The dialog may be planning another month or currency than the list
		// behind it. Show what was just made rather than closing onto a list
		// where it is invisible.
		const viewMonth = String(form.get('viewMonth') ?? '');
		const viewCurrency = String(form.get('viewCurrency') ?? '');
		if (
			viewMonth &&
			(budget.month !== viewMonth || (viewCurrency && budget.currency !== viewCurrency))
		)
			redirect(303, `/finance/budgets?month=${budget.month}&currency=${budget.currency}`);
	}),
	update: formAction((ctx, form) => {
		const before = getBudget(ctx, Number(form.get('id')));
		const currency = form.has('currency') ? String(form.get('currency')) : before.currency;
		updateBudget(ctx, before.id, {
			month: form.has('month') ? form.get('month') : undefined,
			category: form.has('category') ? form.get('category') : undefined,
			currency,
			amountMinor: form.has('amount') ? amount(form.get('amount'), currency) : undefined,
			updatedAt: form.get('updatedAt') ?? undefined
		});
		const after = getBudget(ctx, before.id);
		const viewMonth = String(form.get('viewMonth') ?? '');
		const viewCurrency = String(form.get('viewCurrency') ?? '');
		if (
			viewMonth &&
			(after.month !== viewMonth || (viewCurrency && after.currency !== viewCurrency))
		)
			redirect(303, `/finance/budgets?month=${after.month}&currency=${after.currency}`);
	}),
	delete: formAction((ctx, form) => {
		deleteBudget(ctx, Number(form.get('id')));
	}),
	copy: formAction((ctx, form) =>
		copyBudgets(ctx, { fromMonth: form.get('fromMonth'), toMonth: form.get('toMonth') })
	),
	/** A category made without leaving the budget form. It is a normal rule:
	 * the Rules tab lists it, imports can match it, and it survives reloads. */
	createCategory: formAction((ctx, form) => {
		const name = String(form.get('categoryName') ?? '').trim();
		// Match the name literally; the Rules tab is where a pattern is refined.
		const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const rule = createRule(ctx, { kind: 'category', name, pattern });
		return { category: rule.name };
	})
};
