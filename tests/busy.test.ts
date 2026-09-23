/**
 * @vitest-environment happy-dom
 *
 * The wait that is not a navigation.
 *
 * Two things can go wrong with a counter behind an indicator, and both leave
 * the bar wrong rather than the page wrong, which is why they are easy to ship
 * and hard to notice: the first of two overlapping waits putting the bar away
 * while the second is still going, and a wait that throws leaving it up for
 * the rest of the session.
 */
import { describe, expect, test } from 'vitest';
import { busy, whileBusy } from '../src/lib/busy.svelte';

/** A promise this test decides when to settle. */
function deferred<T = void>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('a wait that is not a navigation', () => {
	test('says nothing when nothing is waiting', () => {
		expect(busy()).toBe(false);
	});

	test('is busy for as long as the work takes, and gives back what it gave', async () => {
		const work = deferred<string>();
		const shown = whileBusy(work.promise);
		expect(busy()).toBe(true);
		work.resolve('the loaders re-ran');
		await expect(shown).resolves.toBe('the loaders re-ran');
		expect(busy()).toBe(false);
	});

	test('the first of two to finish does not put the indicator away', async () => {
		const first = deferred();
		const second = deferred();
		const a = whileBusy(first.promise);
		const b = whileBusy(second.promise);
		expect(busy()).toBe(true);

		first.resolve();
		await a;
		expect(busy()).toBe(true);

		second.resolve();
		await b;
		expect(busy()).toBe(false);
	});

	test('a wait that throws still ends, and the failure reaches the caller', async () => {
		const work = deferred();
		const shown = whileBusy(work.promise);
		expect(busy()).toBe(true);
		work.reject(new Error('the loaders did not'));
		await expect(shown).rejects.toThrow('the loaders did not');
		expect(busy()).toBe(false);
	});
});
