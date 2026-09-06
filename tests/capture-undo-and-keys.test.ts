/**
 * @vitest-environment happy-dom
 *
 * The four things worth writing down, the seconds after a delete, the keys a
 * block can carry, and the modifier the keyboard in front of you actually has.
 *
 * The undo window is the one with teeth. Nothing here is soft-deleted: the
 * request simply has not been sent yet, so the two ways it can go wrong are a
 * delete that gets sent after it was taken back, and one that is quietly
 * forgotten because the page was left before the timer ran out. Both are
 * pinned below.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CAPTURES, captureByShortcut, visibleCaptures } from '../src/lib/capture';
import {
	cancelFor,
	changeLater,
	deleteLater,
	flushNow,
	isLeaving,
	isPending,
	takeBack,
	undo,
	undoable
} from '../src/lib/undo.svelte';
import { mergeSuggestions, parseSlotMeta, SUGGESTED_KEYS } from '../src/lib/meta-keys';
import { commandKey } from '../src/lib/platform';

afterEach(() => {
	for (const p of undo.pending) clearTimeout(p.timer);
	undo.pending = [];
	undo.seconds = 5;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('the four things worth writing down', () => {
	test('each names a place to write to and a key to get there', () => {
		for (const capture of CAPTURES) {
			expect(capture.action).toMatch(/^\/.+\?\/create$/);
			expect(capture.shortcut).toHaveLength(1);
			expect(capture.color).toMatch(/^#|^oklch|^rgb/);
		}
	});

	test('no two answer to the same keystroke', () => {
		const keys = CAPTURES.map((c) => c.shortcut);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test('a hidden section takes its wedge with it', () => {
		const hidden = visibleCaptures(['ideas', 'shopping']).map((c) => c.key);
		expect(hidden).not.toContain('idea');
		expect(hidden).not.toContain('buy');
		// Todo has no section to hide behind: the planner is always there.
		expect(hidden).toContain('todo');
	});

	test('and a keystroke finds its capture, or nothing at all', () => {
		expect(captureByShortcut('i')?.key).toBe('idea');
		expect(captureByShortcut('z')).toBeUndefined();
	});
});

describe('a delete that is still on its way', () => {
	test('leaves the list at once and is sent when the window closes', () => {
		vi.useFakeTimers();
		const send = vi.fn();
		deleteLater('item:1', 'olive oil', send);

		// Gone from the screen immediately, though nothing has been sent.
		expect(isLeaving('item:1')).toBe(true);
		expect(send).not.toHaveBeenCalled();

		vi.advanceTimersByTime(5000);
		expect(send).toHaveBeenCalledTimes(1);
		expect(isLeaving('item:1')).toBe(false);
	});

	test('is never sent once it has been taken back', () => {
		vi.useFakeTimers();
		const send = vi.fn();
		deleteLater('item:2', 'olive oil', send);

		takeBack(undo.pending[0].id);
		vi.advanceTimersByTime(60_000);

		expect(send).not.toHaveBeenCalled();
		expect(isLeaving('item:2')).toBe(false);
	});

	test('taking back something that already went is not an error', () => {
		expect(() => takeBack(9999)).not.toThrow();
	});

	test('goes immediately, and silently, where the instance turned the window off', () => {
		const send = vi.fn();
		undo.seconds = 0;
		deleteLater('item:3', 'olive oil', send);

		expect(send).toHaveBeenCalledTimes(1);
		expect(undo.pending).toHaveLength(0);
	});

	test('is sent, not dropped, when the page is left inside the window', () => {
		// A delete somebody confirmed must not be quietly forgotten because they
		// clicked a link four seconds later.
		vi.useFakeTimers();
		const first = vi.fn();
		const second = vi.fn();
		deleteLater('item:4', 'a', first);
		deleteLater('item:5', 'b', second);

		flushNow();

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		expect(undo.pending).toHaveLength(0);

		// And the timers it cleared do not fire it a second time.
		vi.advanceTimersByTime(60_000);
		expect(first).toHaveBeenCalledTimes(1);
	});

	test('several at once are each their own row', () => {
		vi.useFakeTimers();
		deleteLater('item:6', 'a', vi.fn());
		deleteLater('item:7', 'b', vi.fn());

		expect(undo.pending).toHaveLength(2);
		expect(undo.pending.map((p) => p.message)).toEqual(['Deleted a', 'Deleted b']);
		expect(isLeaving('item:8')).toBe(false);
	});

	test('a todo ticked off is held the same way, but its row stays put', () => {
		// A delete hides the row while it waits; a tick does not — the list has
		// to draw the outcome, which is what `isPending` answers and `isLeaving`
		// deliberately does not.
		vi.useFakeTimers();
		const send = vi.fn();
		changeLater('todo:9', 'Completed call the landlord', send);

		expect(undo.pending[0].message).toBe('Completed call the landlord');
		expect(isPending('todo:9')).toBe(true);
		expect(isLeaving('todo:9')).toBe(false);

		vi.advanceTimersByTime(5_000);
		expect(send).toHaveBeenCalledTimes(1);
	});

	test('ticking the same row twice takes it back rather than queueing both', () => {
		// Clicking the box a second time inside the window is the same gesture as
		// pressing Undo. Queueing the opposite write behind the first would leave
		// the outcome decided by whichever timer landed last.
		vi.useFakeTimers();
		const send = vi.fn();
		changeLater('todo:10', 'Completed a', send);
		cancelFor('todo:10');

		expect(undo.pending).toHaveLength(0);
		vi.advanceTimersByTime(60_000);
		expect(send).not.toHaveBeenCalled();
	});
});

/**
 * The blink: a ticked todo coming back for a moment before leaving.
 *
 * The entry used to be dropped the instant the window closed, and the send
 * left running. For the length of that round trip the list was drawing the
 * server's OLD answer — the todo undone — so it reappeared and then vanished
 * when the reload landed. Reported as "the undo feature is kind of fucked",
 * and it is: the tick looked like it had failed.
 *
 * So an entry now outlives its own window and is dropped when the write has
 * actually landed. The toast still goes at the window, because by then there
 * is nothing left to take back.
 */
describe('an action whose window has closed but whose write is still in flight', () => {
	test('keeps holding the new state until the write lands', async () => {
		vi.useFakeTimers();
		let land: () => void = () => {};
		const send = vi.fn(() => new Promise<void>((resolve) => (land = resolve)));

		changeLater('todo:9', 'Completed the thing', send);
		expect(isPending('todo:9')).toBe(true);

		vi.advanceTimersByTime(5000);
		expect(send).toHaveBeenCalledTimes(1);
		// The window is over, but the row must not blink back to undone.
		expect(isPending('todo:9')).toBe(true);
		// …and there is nothing left to offer an Undo for.
		expect(undoable()).toHaveLength(0);

		land();
		await vi.waitFor(() => expect(isPending('todo:9')).toBe(false));
	});

	test('lets go when the write fails, rather than lying about it', async () => {
		vi.useFakeTimers();
		let fail: (e: unknown) => void = () => {};
		changeLater(
			'todo:10',
			'Completed the thing',
			() => new Promise((_, reject) => (fail = reject))
		);

		vi.advanceTimersByTime(5000);
		expect(isPending('todo:10')).toBe(true);

		fail(new Error('the server said no'));
		await vi.waitFor(() => expect(isPending('todo:10')).toBe(false));
	});

	test('cannot be taken back once it has gone', () => {
		vi.useFakeTimers();
		const send = vi.fn(() => new Promise<void>(() => {}));
		changeLater('todo:11', 'Completed the thing', send);
		const { id } = undo.pending[0];

		vi.advanceTimersByTime(5000);
		takeBack(id);
		cancelFor('todo:11');

		// Still held: the request is on its way, and pretending otherwise would
		// leave the screen disagreeing with the server.
		expect(isPending('todo:11')).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);
	});
});

describe('the keys a block can carry', () => {
	test('the app suggests a few generic ones', () => {
		expect(SUGGESTED_KEYS.map((s) => s.key)).toContain('location');
	});

	test("a plugin's own description wins for the key it claims", () => {
		// It knows what the key does to it; a generic gloss would say less.
		const merged = mergeSuggestions([
			{
				name: 'scale',
				metaKeys: [{ key: 'location', description: 'Which room the scale is in', example: 'B12' }]
			}
		]);

		const location = merged.find((s) => s.key === 'location')!;
		expect(location.description).toBe('Which room the scale is in');
		expect(location.usedBy).toBe('scale');
	});

	test('two plugins claiming one key are both named, not picked between', () => {
		const merged = mergeSuggestions([
			{ name: 'scale', metaKeys: [{ key: 'weight', description: 'kg', example: '80' }] },
			{ name: 'watch', metaKeys: [{ key: 'weight', description: '', example: '' }] }
		]);

		const weight = merged.find((s) => s.key === 'weight')!;
		expect(weight.usedBy).toBe('scale, watch');
		// And the one that said something keeps having said it.
		expect(weight.description).toBe('kg');
	});

	test('a plugin key the app never suggested is added', () => {
		const merged = mergeSuggestions([
			{ name: 'scale', metaKeys: [{ key: 'zzz_last', description: 'd', example: 'e' }] }
		]);
		expect(merged.map((s) => s.key)).toContain('zzz_last');
		// Sorted, so the list does not reshuffle as plugins come and go.
		expect(merged.map((s) => s.key)).toEqual([...merged.map((s) => s.key)].sort());
	});

	test('and with no plugins the suggestions are just the app’s own', () => {
		expect(mergeSuggestions([]).map((s) => s.key)).toEqual(
			[...SUGGESTED_KEYS.map((s) => s.key)].sort()
		);
	});
});

describe('metadata read back out of storage', () => {
	test('is a flat set of strings', () => {
		expect(parseSlotMeta('{"location":"gym","reps":5,"done":true}')).toEqual({
			location: 'gym',
			reps: '5',
			done: 'true'
		});
	});

	test('survives anything that is not that', () => {
		// It is a column, so it can hold whatever an older version wrote. A block
		// that throws on render is a block nobody can fix.
		expect(parseSlotMeta(null)).toEqual({});
		expect(parseSlotMeta('')).toEqual({});
		expect(parseSlotMeta('not json')).toEqual({});
		expect(parseSlotMeta('[1,2]')).toEqual({});
		expect(parseSlotMeta('"a string"')).toEqual({});
	});

	test('and drops a value no label could show', () => {
		expect(parseSlotMeta('{"ok":"yes","nested":{"a":1}}')).toEqual({ ok: 'yes' });
	});
});

describe('the modifier printed in a hint', () => {
	test('is Ctrl on the keyboards most people have', () => {
		vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Firefox' });
		expect(commandKey()).toBe('Ctrl');
	});

	test('and ⌘ on the ones that have it', () => {
		// ⌘K printed on Linux is a symbol for a key that is not there.
		vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Safari' });
		expect(commandKey()).toBe('⌘');

		vi.stubGlobal('navigator', { userAgentData: { platform: 'macOS' }, userAgent: '' });
		expect(commandKey()).toBe('⌘');

		vi.stubGlobal('navigator', { platform: '', userAgent: 'iPhone' });
		expect(commandKey()).toBe('⌘');
	});
});
