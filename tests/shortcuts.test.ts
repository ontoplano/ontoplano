/**
 * The keybind registry is the one source of truth, so it has to be coherent:
 * one meaning per key per page, and a hint that asks for a binding that does
 * not exist must fail loudly rather than render a wrong letter.
 */
import { describe, expect, test } from 'vitest';
import { GLOBAL_SHORTCUTS, PAGE_SHORTCUTS, getAction, keyFor } from '../src/lib/shortcuts';

describe('the registry', () => {
	test('no page binds one key to two actions', () => {
		for (const [path, page] of Object.entries(PAGE_SHORTCUTS)) {
			const seen = new Map<string, string>();
			for (const s of page.shortcuts) {
				const already = seen.get(s.key);
				expect(
					already === undefined || already === s.action,
					`${path}: '${s.key}' is both '${already}' and '${s.action}'`
				).toBe(true);
				seen.set(s.key, s.action);
			}
		}
	});

	/*
	 * A page may take a key a global uses, and it has to be on purpose.
	 *
	 * The shell resolves the overlap — `handleGlobalKeydown` asks `getAction`
	 * whether this page has claimed the key and stands down if it has — so an
	 * overlap is a decision rather than a race between two `keydown` handlers.
	 * Listing them here is what keeps it a decision: a new one fails this test
	 * until somebody writes down why it is worth it.
	 */
	const DELIBERATE_OVERLAP: Record<string, string[]> = {
		// H and L walk the places inside a room; on the board they carry a card
		// into the next column, which is the better use of them on a board.
		'/tasks/board': ['H', 'L']
	};

	test('no page shadows a global binding by accident', () => {
		const globals = new Set(GLOBAL_SHORTCUTS.map((s) => s.key));
		for (const [path, page] of Object.entries(PAGE_SHORTCUTS)) {
			for (const s of page.shortcuts) {
				if (DELIBERATE_OVERLAP[path]?.includes(s.key)) continue;
				expect(globals.has(s.key), `${path}: '${s.key}' shadows a global shortcut`).toBe(false);
			}
		}
	});

	test('and every overlap written down is a real one', () => {
		// Otherwise the list outlives the binding it was excusing, and the next
		// person cannot tell which entries still matter.
		const globals = new Set(GLOBAL_SHORTCUTS.map((s) => s.key));
		for (const [path, keys] of Object.entries(DELIBERATE_OVERLAP)) {
			const page = PAGE_SHORTCUTS[path];
			expect(page, `${path} is listed as overlapping and has no shortcuts`).toBeDefined();
			for (const key of keys) {
				expect(globals.has(key), `${path}: '${key}' is listed and is not a global`).toBe(true);
				expect(
					page.shortcuts.some((s) => s.key === key),
					`${path}: '${key}' is listed and the page does not bind it`
				).toBe(true);
			}
		}
	});

	test('keyFor answers for a real binding and refuses a missing one', () => {
		expect(keyFor('/tasks/todo', 'new')).toBe('n');
		expect(() => keyFor('/tasks/todo', 'no-such-action')).toThrow(/no-such-action/);
		expect(() => keyFor('/no/such/page', 'new')).toThrow();
	});

	test('getAction answers keys and stays silent otherwise', () => {
		expect(getAction('/tasks/board', 'Enter')).toBe('edit');
		expect(getAction('/tasks/board', '3')).toBe('rate');
		expect(getAction('/tasks/board', 'z')).toBeNull();
	});
});
