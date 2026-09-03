/**
 * The nightly pass over billing.
 *
 * Webhooks are the source of truth, and a webhook that never arrived leaves no
 * trace to notice. This is the noticing: anything whose paid period or trial
 * has run out is marked expired, and — when a payment provider is configured —
 * every subscription the provider still knows about is fetched and compared.
 *
 * From cron, once a day:
 *
 *   0 4 * * * cd /path/to/ontoplano && npx tsx scripts/reconcile-billing.ts
 *
 * Safe to run twice: everything it does is idempotent.
 */
import { loadProvider } from '../src/lib/server/billing/load.js';

// Before the first question about billing: this runs under plain `tsx`, so the
// build-time resolution the app relies on has not happened. Without it every
// run would find no provider and quietly check nothing against it.
await loadProvider();

const { reconcile } = await import('../src/lib/server/services/billing.js');

const result = await reconcile();

console.log(
	`billing: ${result.expired} lapsed, ${result.checked} checked against the provider, ` +
		`${result.noticed} told their trial ends soon`
);
