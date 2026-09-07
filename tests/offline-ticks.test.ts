/**
 * @vitest-environment happy-dom
 *
 * Ticking things off the shopping list with no signal.
 *
 * The service worker deliberately never replays writes — a queued POST firing
 * on reconnect could complete a task twice. This is the one exception, and it
 * is narrow: "I bought the milk" is one account setting one boolean, and it is
 * the only write anybody makes standing in a shop with no bars.
 *
 * Which makes it the hardest thing in the app to check by hand — it needs a
 * dead network, a closed tab and a walk home. So the whole cycle is pinned
 * here: remembered while offline, survives the tab closing, sent on reconnect,
 * and kept rather than dropped when sending still fails.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flush, remember, restore, ticks } from '../src/lib/offline-ticks.svelte';

const KEY = 'shopping.pendingTicks';

beforeEach(() => {
	localStorage.clear();
	ticks.pending = [];
});

afterEach(() => vi.unstubAllGlobals());

/** A network that accepts everything, refuses everything, or is simply not there. */
function network(mode: 'ok' | 'refuses' | 'absent') {
	const sent: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			sent.push(url);
			if (mode === 'absent') throw new TypeError('Failed to fetch');
			return { ok: mode === 'ok' };
		})
	);
	return sent;
}

describe('a tick made with no signal', () => {
	test('is kept, and written down where a closed tab cannot lose it', () => {
		remember({ id: 3, action: 'toggleBought' });

		expect(ticks.pending).toEqual([{ id: 3, action: 'toggleBought' }]);
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([{ id: 3, action: 'toggleBought' }]);
	});

	test('and is found again by the next session', () => {
		// The walk home with the tab closed.
		localStorage.setItem(KEY, JSON.stringify([{ id: 3, action: 'toggleBought' }]));
		restore();
		expect(ticks.pending).toHaveLength(1);
	});

	test('twice on the same button cancels out', () => {
		// Two toggles of one checkbox is not two intentions, it is none.
		remember({ id: 3, action: 'toggleBought' });
		remember({ id: 3, action: 'toggleBought' });

		expect(ticks.pending).toEqual([]);
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
	});

	test('but two different things on one item are both kept', () => {
		remember({ id: 3, action: 'toggleBought' });
		remember({ id: 3, action: 'toggleSnoozed' });
		expect(ticks.pending).toHaveLength(2);
	});
});

describe('what a previous session left behind', () => {
	test('is nothing when there is nothing', () => {
		restore();
		expect(ticks.pending).toEqual([]);
	});

	test('and nothing when what is there cannot be read', () => {
		// Storage holds whatever an older version wrote. A shopping list that
		// will not open because of a stale key is worse than a lost tick.
		localStorage.setItem(KEY, 'not json');
		restore();
		expect(ticks.pending).toEqual([]);

		localStorage.setItem(KEY, '{"not":"a list"}');
		restore();
		expect(ticks.pending).toEqual([]);
	});
});

describe('finding a signal again', () => {
	test('sends what was waiting and clears it', async () => {
		remember({ id: 3, action: 'toggleBought' });
		remember({ id: 4, action: 'restock' });
		const sent = network('ok');

		expect(await flush()).toBe(2);
		expect(ticks.pending).toEqual([]);
		expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
		expect(sent).toEqual(['/inventory/list?/toggleBought', '/inventory/list?/restock']);
	});

	test('sends nothing when nothing is waiting', async () => {
		const sent = network('ok');
		expect(await flush()).toBe(0);
		expect(sent).toEqual([]);
	});

	test('keeps a tick the server would not take', async () => {
		remember({ id: 3, action: 'toggleBought' });
		network('refuses');

		expect(await flush()).toBe(0);
		// Still waiting, and still written down — dropping it would silently
		// lose something somebody did.
		expect(ticks.pending).toHaveLength(1);
		expect(JSON.parse(localStorage.getItem(KEY)!)).toHaveLength(1);
	});

	test('and keeps one the network never carried at all', async () => {
		remember({ id: 3, action: 'toggleBought' });
		network('absent');

		await expect(flush()).resolves.toBe(0);
		expect(ticks.pending).toHaveLength(1);
	});

	test('keeps only what failed, when some of it went', async () => {
		remember({ id: 3, action: 'toggleBought' });
		remember({ id: 4, action: 'restock' });

		let call = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({ ok: call++ === 0 }))
		);

		expect(await flush()).toBe(1);
		expect(ticks.pending).toEqual([{ id: 4, action: 'restock' }]);
	});

	test('one at a time, because they are all writes to the same list', async () => {
		// A burst of them on a phone that has just found a signal is how half of
		// them get dropped.
		remember({ id: 3, action: 'toggleBought' });
		remember({ id: 4, action: 'restock' });

		let inFlight = 0;
		let overlapped = false;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				inFlight++;
				if (inFlight > 1) overlapped = true;
				await Promise.resolve();
				inFlight--;
				return { ok: true };
			})
		);

		await flush();
		expect(overlapped).toBe(false);
	});
});
