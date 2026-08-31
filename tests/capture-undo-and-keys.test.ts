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
import { deleteLater, flushNow, isLeaving, takeBack, undo } from '../src/lib/undo.svelte';
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
		expect(undo.pending.map((p) => p.label)).toEqual(['a', 'b']);
		expect(isLeaving('item:8')).toBe(false);
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
