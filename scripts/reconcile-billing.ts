/**
 * The nightly pass over billing.
 *
 * Webhooks are the source of truth, and a webhook that never arrived leaves no
 * trace to notice. This is the noticing: anything whose paid period or trial
 * has run out is marked expired, and — when `LEMONSQUEEZY_API_KEY` is set —
 * every subscription the provider still knows about is fetched and compared.
 *
 * From cron, once a day:
 *
 *   0 4 * * * cd /path/to/ontoplano && npx tsx scripts/reconcile-billing.ts
 *
 * Safe to run twice: everything it does is idempotent.
 */
import { reconcile } from '../src/lib/server/services/billing.js';

const result = await reconcile();

console.log(`billing: ${result.expired} lapsed, ${result.checked} checked against the provider`);
