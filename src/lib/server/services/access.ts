import { pricing } from '../settings.js';
import { isBillingConfigured } from './billing.js';
import { resolvePlan } from './subscriptions.js';

/**
 * The account-level holds, decided in exactly one place.
 *
 * A hold is a state in which the app must not be usable: the address is
 * unconfirmed, the card was never given, the subscription ran out. The page
 * gate in hooks.server.ts and the API door in api/auth.ts both ask THIS —
 * so a future route, action or plugin endpoint cannot forget a rule it
 * never has to remember. Add new holds here and nowhere else.
 */
export type AccessHold = 'verify' | 'billing' | 'expired' | null;

const REQUIRE_VERIFIED_EMAIL = process.env.ONTOPLANO_REQUIRE_VERIFIED_EMAIL === 'true';

export function accessHoldFor(user: { id: string; emailVerified: boolean }): AccessHold {
	if (REQUIRE_VERIFIED_EMAIL && !user.emailVerified) return 'verify';
	return paymentHoldFor(user.id);
}

/**
 * The payment half alone — what an API token can be checked against without
 * fetching the user row. Plugins stop when the subscription does.
 */
export function paymentHoldFor(userId: string): Exclude<AccessHold, 'verify'> {
	if (!isBillingConfigured()) return null;
	const entitlement = resolvePlan(userId);
	if (entitlement.plan !== 'none') return null;
	// Ran out: everything is kept and exportable, nothing else works.
	if (entitlement.source === 'lapsed') return 'expired';
	// Never started: the card page is the next step of registration.
	if (pricing().trialRequiresCard) return 'billing';
	return null;
}

/** Where a held browser goes. */
export function holdDestination(hold: Exclude<AccessHold, null>): string {
	return hold === 'verify' ? '/login/verify' : '/start';
}
