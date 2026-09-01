import { describeYearly, formatPrice } from '../../plans.js';
import { isSelfHosted } from '../settings.js';
import { displayPricing } from './billing.js';

/**
 * The facts the policies are written around.
 *
 * A privacy policy that says "we may share your data with partners" when there
 * are no partners is worse than none — it teaches people that the page is
 * boilerplate. So the pages state what this instance actually does, and the
 * few things that differ between deployments come from here.
 *
 * The operator's name, address and jurisdiction are the instance's to set. The
 * defaults say so rather than inventing a company.
 *
 * The price comes from the payment provider rather than from this instance's
 * env, and that is the whole point: the number in the terms is a promise about
 * what a card will be charged, so it has to be the number the provider will
 * actually charge. Reading the env here meant the terms could quote one price
 * while the checkout took another — the one billing disagreement that reaches
 * a stranger's statement. Falls back to the env when the provider cannot be
 * reached, which is also what the billing page does.
 */
export async function legalFacts() {
	const price = await displayPricing();

	return {
		updated: process.env.ONTOPLANO_POLICY_UPDATED ?? '25 August 2026',
		operator: process.env.ONTOPLANO_OPERATOR ?? 'the person who runs this instance',
		contactEmail: process.env.ONTOPLANO_CONTACT_EMAIL ?? 'hello@ontoplano.app',
		jurisdiction: process.env.ONTOPLANO_JURISDICTION ?? 'the operator’s own country',
		backupRetentionDays: Number(process.env.ONTOPLANO_BACKUP_RETENTION_DAYS ?? 30),
		trialDays: price.trialDays,
		trialRequiresCard: price.trialRequiresCard,
		provider: price.provider,
		monthly: formatPrice(price.monthlyCents, price.currency),
		yearly: describeYearly(price),
		hosted: !isSelfHosted()
	};
}
