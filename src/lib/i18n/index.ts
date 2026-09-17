/**
 * The translator, for a component.
 *
 * Everything that does not need Svelte is in `core.ts` and re-exported here, so
 * a component imports `$lib/i18n` and gets all of it. Anything that is not a
 * component — the mailer, a job, a service — imports `$lib/i18n/core` instead:
 * this file reaches for `svelte`, which is a devDependency and is not installed
 * on the box the jobs run on. `yarn jobs:check` is what says so.
 */
import { getContext, setContext } from 'svelte';

import type { Translate } from './core.js';
import type { MessageKey, MessageValues } from './core.js';

export * from './core.js';

const KEY = Symbol('ontoplano.t');

/**
 * Put the page's translator where every component under this one finds it.
 *
 * Takes a function rather than a translator, because context is set once and
 * the language is not fixed for the life of the tree: choosing a new one
 * re-runs the loads, and a translator captured at setup would go on speaking
 * the language the page was opened in. The getter closes over a `$derived`, so
 * every word re-renders when the answer changes.
 */
export function provideT(source: () => Translate): void {
	setContext(KEY, source);
}

/**
 * The translator for this component.
 *
 * Called once, at the top of a component's script, like any other context.
 * Outside a component — a `.ts` helper that builds a string — take a
 * `Translate` as an argument instead: a module that reaches for the current
 * language is a module that cannot be called from the server.
 */
export function useT(): Translate {
	const source = getContext<(() => Translate) | undefined>(KEY);
	if (!source) {
		throw new Error(
			'useT() outside a translated tree — the root layout provides it. A module that is ' +
				'not a component should take a Translate as an argument.'
		);
	}

	/*
	 * A stable function that asks again every time.
	 *
	 * Held for the life of the component like any other `const`, so a caller
	 * can keep it; reading through the getter on each call, so it says what the
	 * current language says rather than what it said at setup.
	 */
	const live = ((key: MessageKey, values?: MessageValues) =>
		(source() as (k: MessageKey, v?: MessageValues) => string)(key, values)) as Translate;

	Object.defineProperty(live, 'locale', { get: () => source().locale });
	return live;
}
