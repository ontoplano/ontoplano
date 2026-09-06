import type { BillingProvider, PlayChannel } from './contract.js';
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
 *
 * ## Outside Vite
 *
 * `import.meta.glob` is Vite's, and the nightly `scripts/reconcile-billing.ts`
 * runs under plain `tsx`, where it does not exist — so the call is guarded and
 * such an entry point finds the provider for itself, with `load.ts`, and hands
 * it over through `useProvider()` before asking anything about billing. The
 * guard has to be written as a condition around the literal call rather than a
 * saved reference: Vite rewrites the call expression at build time, and only
 * recognises it spelled out.
 */
/*
 * Whatever provider was compiled in, or nothing.
 *
 * `import.meta.glob` is Vite's, and it is a *build-time rewrite of the call
 * expression* rather than a function that exists at runtime. That distinction
 * cost this project its whole billing integration for a fortnight, silently.
 *
 * The guard used to read `typeof import.meta.glob === 'function' ? glob(…) : {}`
 * — written that way so that a plain `tsx` script, where Vite never ran, would
 * not call something that does not exist. Vite duly replaced the call and left
 * the condition alone, so the built server shipped:
 *
 *     typeof import.meta.glob === "function" ? { "./providers/paddle.ts": … } : {}
 *
 * `import.meta.glob` is undefined in Node. The condition was false in every
 * production build, the object was discarded, and the app decided it had no
 * payment provider — while the provider sat in the bundle, imported and unused.
 * Nothing failed, nothing logged, and an instance that sells simply could not.
 *
 * A `try` instead. Under Vite the call is already an object literal by the time
 * this runs, so the `try` is inert; under `tsx` the call throws on undefined and
 * the catch leaves this empty, which is exactly what `load.ts` and
 * `useProvider()` are for. The difference is that this version cannot be true
 * at build time and false at run time.
 */
let found: Record<string, { provider?: BillingProvider; playChannel?: PlayChannel } | undefined> =
	{};
try {
	found = import.meta.glob<{ provider?: BillingProvider; playChannel?: PlayChannel }>(
		'./providers/*.ts',
		{ eager: true }
	);
} catch {
	// No Vite: a script running under tsx. `useProvider()` is how it is told.
}

/** Set by an entry point Vite never compiled. See `load.ts`. */
let registered: BillingProvider | null = null;

/**
 * Use this provider, for a process that had to find it itself.
 *
 * Called before anything asks about billing, and only from a script: inside the
 * app the glob above has already answered.
 */
export function useProvider(found: BillingProvider): void {
	registered = found;
	cached = null;
}

function resolve(): BillingProvider {
	if (registered) return registered;

	const modules = Object.entries(found).filter(([, m]) => m?.provider);

	if (modules.length === 0) return noBilling;

	if (modules.length > 1) {
		console.error(
			`billing: ${modules.length} providers in src/lib/server/billing/providers — ` +
				`using ${modules[0][0]} and ignoring the rest. There should be one.`
		);
	}

	return modules[0][1]!.provider as BillingProvider;
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

/* ── The Play channel ─────────────────────────────────────────────────────────
 *
 * Resolved from the same glob, by a different export: a module that says
 * `playChannel` is the Play half, and the one that says `provider` is the
 * checkout provider — so the two coexist in providers/ without the
 * one-provider rule tripping over the store's billing. Null is the ordinary
 * answer: a self-hosted copy, a dev machine, an instance not in the store.
 */
let registeredPlay: PlayChannel | null = null;

/** For a script outside Vite, the way `useProvider` is. */
export function usePlayChannel(channel: PlayChannel): void {
	registeredPlay = channel;
	cachedPlay = undefined;
}

let cachedPlay: PlayChannel | null | undefined;

export function playChannel(): PlayChannel | null {
	if (cachedPlay === undefined) {
		cachedPlay =
			registeredPlay ?? Object.values(found).find((m) => m?.playChannel)?.playChannel ?? null;
	}
	return cachedPlay;
}
