import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { LIMIT_KEYS, PLANS } from '$lib/plans';
import { isSelfHosted } from '$lib/server/settings';
import { buildCtx } from '$lib/server/services/ctx';
import { exportAllowance } from '$lib/server/services/account';
import { resolvePlan, usage } from '$lib/server/services/subscriptions';
import { checkoutUrl, portalUrl, isBillingConfigured } from '$lib/server/services/billing';

/**
 * What this account is on, and what it is using.
 *
 * A self-hosted instance sells nothing, so the page says so and stops — the
 * same answer the Telegram bot and the deployment settings give.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const ctx = buildCtx(locals.user!.id);
	const entitlement = resolvePlan(ctx.userId, ctx.now);

	if (!entitlement.billable && !isSelfHosted()) error(404, 'Not found');

	const counts = usage(ctx.userId);
	counts.exportsPerDay =
		(PLANS[entitlement.plan].limits.exportsPerDay ?? 0) - exportAllowance(ctx.userId).remaining;

	return {
		entitlement,
		selfHosted: isSelfHosted(),
		configured: isBillingConfigured(),
		plans: Object.values(PLANS),
		limitKeys: LIMIT_KEYS,
		usage: counts,
		checkout:
			entitlement.plan === 'pro' && entitlement.source === 'subscription'
				? null
				: checkoutUrl(ctx.userId),
		portal: entitlement.source === 'subscription' ? portalUrl(ctx.userId) : null
	};
};
