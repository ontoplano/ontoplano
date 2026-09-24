/**
 * The order a notebook's tabs come in.
 *
 * A renovation is mostly a list of things to buy and a trip is mostly a list
 * of things to book, so which tab a notebook opens on is the notebook's answer
 * and not this file's. It used to be neither: `parseModules` and
 * `serializeModules` both sorted by the registry, so an order could be sent in
 * and was thrown away on the way past — once on the write and again on the
 * read, which is why nobody noticed the first one.
 */
import { describe, expect, test } from 'vitest';
import { parseModules, serializeModules, moduleChoicesOf } from '../src/lib/notebook-modules';

describe('what a notebook holds, in its own order', () => {
	test('keeps the order it was given', () => {
		expect(serializeModules(['tasks', 'notes', 'bills'])).toBe('tasks,notes,bills');
		expect(parseModules('tasks,notes,bills')).toEqual(['tasks', 'notes', 'bills']);
	});

	test('a module that is always there is added at the end, not forced to the front', () => {
		// Notes first is a default, not a rule: a notebook whose first tab is
		// its shopping is one somebody has arranged.
		expect(parseModules('inventory,tasks')).toEqual(['inventory', 'tasks', 'notes']);
	});

	test('drops what this version has never heard of, and never repeats one', () => {
		expect(parseModules('tasks,sorcery,tasks,notes')).toEqual(['tasks', 'notes']);
	});

	test('nothing stored at all is the default set', () => {
		expect(parseModules(null).length).toBeGreaterThan(0);
		expect(parseModules(null)).toContain('notes');
	});

	/*
	 * The dialog is where the order is set, so it has to be the order the
	 * dialog shows — and a module that is off has no tab and so no place in it.
	 */
	test('the dialog offers what it holds first, and the rest after', () => {
		const offered = moduleChoicesOf({
			modules: ['tasks', 'notes'],
			counts: {} as Record<string, number>
		} as never);

		expect(offered.slice(0, 2).map((one) => one.id)).toEqual(['tasks', 'notes']);
		expect(offered.slice(2).every((one) => !one.on)).toBe(true);
	});
});
