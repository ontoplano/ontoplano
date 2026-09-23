/**
 * @vitest-environment happy-dom
 *
 * What the app says after you press something.
 *
 * Three kinds, and the difference between them is what the toast offers:
 *
 *   **Made something** — "Task added", with a way straight into it. The thing
 *   you most often want after making a task is to say more about it, and
 *   hunting for the row you just made to press edit is the long way round.
 *   Not an undo: you asked for it, it is there, and taking it back is what
 *   delete is for.
 *
 *   **Changed something** — "Saved", with nothing to press. The change is
 *   already on the screen behind the toast.
 *
 *   **Removed something** — that one belongs to `undo.svelte.ts`, which holds
 *   the request open for a few seconds so it can still be called off. Tested
 *   over there; named here so the three are read together.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SAID_MS, said, say } from '../src/lib/said.svelte';

afterEach(() => {
	said.items = [];
	vi.useRealTimers();
});

describe('a sentence the app says', () => {
	test('is up straight away, and gone on its own', () => {
		vi.useFakeTimers();
		say('Saved');
		expect(said.items.map((i) => i.message)).toEqual(['Saved']);

		vi.advanceTimersByTime(SAID_MS - 1);
		expect(said.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(said.items).toHaveLength(0);
	});

	test('replaces what is up rather than stacking', () => {
		vi.useFakeTimers();
		say('Saved');
		say('Saved');
		say('Saved');
		// Pressing Save three times is one message that keeps being true, not a
		// column of the app shouting.
		expect(said.items).toHaveLength(1);
	});

	test("the older one's timer cannot take the newer one down", () => {
		vi.useFakeTimers();
		say('First');
		vi.advanceTimersByTime(SAID_MS - 100);
		say('Second');

		// The first message's timer fires here. It must not clear the second.
		vi.advanceTimersByTime(100);
		expect(said.items.map((i) => i.message)).toEqual(['Second']);
	});
});

describe('a sentence with something to press', () => {
	test('carries a label and what pressing it does', () => {
		vi.useFakeTimers();
		const open = vi.fn();
		say('Task added', { label: 'Edit', run: open });

		expect(said.items).toHaveLength(1);
		expect(said.items[0].action?.label).toBe('Edit');

		said.items[0].action?.run();
		expect(open).toHaveBeenCalledTimes(1);
	});

	test('goes away on its own like any other', () => {
		vi.useFakeTimers();
		say('Task added', { label: 'Edit', run: () => {} });
		vi.advanceTimersByTime(SAID_MS);
		expect(said.items).toHaveLength(0);
	});

	test('and a plain one offers nothing to press', () => {
		vi.useFakeTimers();
		say('Saved');
		expect(said.items[0].action).toBeUndefined();
	});
});
