import type { Cookies } from '@sveltejs/kit';
import type { PlanTier } from '../billing/contract.js';

/**
 * Which plan somebody said they wanted, carried from the front page to the card.
 *
 * The choice is made before the account exists — "Ontoplano for the family" is
 * a button on ontoplano.com — and the card step is three pages later, after
 * registering and confirming an address. Nothing in between has anywhere to put
 * it: there is no account row yet at the moment of the click, and adding a
 * column to hold an intention that expires in a minute is worse than a cookie
 * that does.
 *
 * It is a preference, never an authority. `/start` offers both plans however
 * this reads, and what an account is actually *on* comes from the provider's
 * webhook — so a stale or forged cookie can preselect a button and nothing more.
 */
export const WANTED_PLAN_COOKIE = 'ontoplano_plan';

/** What the cookie says, treated as a suggestion. Anything unknown is solo. */
export function wantedPlan(cookies: Cookies): PlanTier {
	return cookies.get(WANTED_PLAN_COOKIE) === 'family' ? 'family' : 'solo';
}

/** Spent the moment a checkout opens: the choice is the provider's now. */
export function forgetWantedPlan(cookies: Cookies): void {
	cookies.delete(WANTED_PLAN_COOKIE, { path: '/' });
}
