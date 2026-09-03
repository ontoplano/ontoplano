import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { displayPricing } from '$lib/server/services/billing';
import { describeYearly, formatPrice } from '$lib/plans';
import { isSelfHosted } from '$lib/server/settings';

/**
 * What this instance charges, for whoever is quoting it.
 *
 * There is one number and it has to be the same everywhere: on the billing
 * page, in the terms, and on ontoplano.com — which is a different repository
 * with no database, built on a laptop. The price it prints was typed into that
 * repo by hand, so it could quote $4.90 while the checkout took something else,
 * and nothing anywhere would notice.
 *
 * So the provider is the single source, this endpoint is how anything outside
 * the app reads it, and `make deploy-site` fetches it at build time. Changing a
 * price is changing it at the provider and deploying; nothing is typed twice.
 *
 * Public and cacheable on purpose: it is the number on a public page, and it
 * discloses nothing an anonymous visitor cannot already read. It carries no
 * account, no ids and no provider keys.
 */
export const GET: RequestHandler = async () => {
	const price = await displayPricing();

	return json(
		{
			currency: price.currency,
			monthlyCents: price.monthlyCents,
			yearlyCents: price.yearlyCents,
			monthly: formatPrice(price.monthlyCents, price.currency),
			yearly: price.yearlyCents ? formatPrice(price.yearlyCents, price.currency) : null,
			yearlyPerMonth: price.yearlyCents
				? formatPrice(Math.round(price.yearlyCents / 12), price.currency)
				: null,
			yearlyDescribed: describeYearly(price),
			// The family plan, absent when this instance does not sell one.
			familyMonthly: price.familyMonthlyCents
				? formatPrice(price.familyMonthlyCents, price.currency)
				: null,
			familyYearly: price.familyYearlyCents
				? formatPrice(price.familyYearlyCents, price.currency)
				: null,
			familyYearlyPerMonth: price.familyYearlyCents
				? formatPrice(Math.round(price.familyYearlyCents / 12), price.currency)
				: null,
			familySeats: price.familySeats,
			trialDays: price.trialDays,
			trialRequiresCard: price.trialRequiresCard,
			// A self-hosted instance sells nothing, and says so rather than
			// quoting the numbers its env happens to carry.
			selling: !isSelfHosted()
		},
		{ headers: { 'cache-control': 'public, max-age=600' } }
	);
};
