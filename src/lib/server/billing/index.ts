import type { BillingProvider } from './contract.js';
import { noBilling } from './none.js';

/**
 * Which provider this build has, decided at build time.
 *
 * `providers/` is empty in this repository and ignored by git. A build that is
 * meant to take money copies one file into it first — see the README in there —
 * and Vite compiles whatever it finds. A build that does not, or a fresh clone
 * of this repository, gets `noBilling` and an app that is complete except that
 * it cannot sell anything.
 *
 * `import.meta.glob` rather than a dynamic `import()` of a path: Vite has to see
 * the set of possible modules at build time to include them, and a path built
 * from a variable is a path it cannot follow. Eager, because the answer is
 * needed synchronously by callers that are not async.
 *
 * More than one file in there is a mistake rather than a choice, and it is
 * called out at startup rather than resolved by sort order.
 */
const found = import.meta.glob<{ provider?: BillingProvider }>('./providers/*.ts', {
	eager: true
});

function resolve(): BillingProvider {
	const modules = Object.entries(found).filter(([, m]) => m?.provider);

	if (modules.length === 0) return noBilling;

	if (modules.length > 1) {
		console.error(
			`billing: ${modules.length} providers in src/lib/server/billing/providers — ` +
				`using ${modules[0][0]} and ignoring the rest. There should be one.`
		);
	}

	return modules[0][1].provider as BillingProvider;
}

let cached: BillingProvider | null = null;

/** The provider this instance has. Never null: `noBilling` is a real answer. */
export function provider(): BillingProvider {
	if (!cached) cached = resolve();
	return cached;
}

/**
 * Whether this build has a real provider compiled into it.
 *
 * For tests about the provider's own behaviour: they are about code this
 * repository does not ship, so on a fresh clone they skip rather than fail.
 * Everything they cover still runs in the build that takes money, which is the
 * one where being wrong costs something.
 */
export function hasBillingProvider(): boolean {
	return provider() !== noBilling;
}

export type { BillingProvider } from './contract.js';
export type { PlanTier, ClientConfig, WebhookOutcome } from './contract.js';
