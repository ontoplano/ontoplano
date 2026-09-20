import { getContext, setContext } from 'svelte';
import type { When } from '$lib/when';

/**
 * The reader's language, zone and clock, reachable from any component.
 *
 * The same arrangement as `useT()` and for the same reason: every screen in
 * the app writes a date or a time, and asking each of them to thread three
 * values down from a load function is how thirty-seven call sites came to
 * disagree about what a time looks like.
 *
 * Provided once by the root layout from the data it already has. A module that
 * is not a component takes a `When` as an argument instead — `$lib/when`'s
 * functions all do.
 */
const KEY = Symbol('when');

export function provideWhen(source: () => When): void {
	setContext(KEY, source);
}

export function useWhen(): () => When {
	const source = getContext<(() => When) | undefined>(KEY);
	if (!source) {
		throw new Error(
			'useWhen() outside the app shell — the root layout provides it. A module that is ' +
				'not a component should take a When as an argument.'
		);
	}
	return source;
}
