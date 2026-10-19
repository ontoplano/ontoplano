import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx, localDateOf } from '$lib/services/ctx';
import { formAction } from '$lib/services/scoped-actions';
import { parseSignedMoney } from '$lib/money';
import { ValidationError } from '$lib/services/errors';
import { getCurrency } from '$lib/services/settings';
import { listLedgers } from '$lib/services/ledgers';
import { filterOptions } from '$lib/services/statements';
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

export const load = ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const currentMonth = localDateOf(ctx.now, ctx.tz).slice(0, 7);
	const selected = url.searchParams.has('budget')
		? getBudget(ctx, Number(url.searchParams.get('budget')))
		: null;
	const requestedMonth = url.searchParams.get('month');
	const month = budgetMonth(monthParam(requestedMonth) ?? selected?.month ?? currentMonth);
	const requestedCurrency = url.searchParams.get('currency') || '';

	const budgets = listBudgets(ctx, {
		month,
		currency: requestedCurrency || undefined
	});

	const options = filterOptions(ctx);
	const ledgers = listLedgers(ctx, { includeArchived: true });
	const ledgerCurrencies = [
		...new Set(ledgers.map((l) => l.currency).filter((currency): currency is string => !!currency))
	];
	const defaultCurrency = ledgerCurrencies[0] ?? getCurrency(ctx.userId);
	const currencies = [...new Set([defaultCurrency, ...ledgerCurrencies])];

	return {
		month,
		currency: requestedCurrency,
		defaultCurrency,
		currencies,
		categories: options.categories.map((category) => category.name),
		budgets
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
		createBudget(ctx, {
			month: form.get('month'),
			category: form.get('category'),
			currency: form.get('currency'),
			amountMinor: amount(form.get('amount'), String(form.get('currency') ?? ''))
		});
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
	}),
	delete: formAction((ctx, form) => {
		deleteBudget(ctx, Number(form.get('id')));
	}),
	copy: formAction((ctx, form) =>
		copyBudgets(ctx, { fromMonth: form.get('fromMonth'), toMonth: form.get('toMonth') })
	)
};
