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

	test('no page shadows a global binding', () => {
		const globals = new Set(GLOBAL_SHORTCUTS.map((s) => s.key));
		for (const [path, page] of Object.entries(PAGE_SHORTCUTS)) {
			for (const s of page.shortcuts) {
				expect(globals.has(s.key), `${path}: '${s.key}' shadows a global shortcut`).toBe(false);
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
