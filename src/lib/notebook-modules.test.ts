import { describe, expect, test } from 'vitest';
import {
	DEFAULT_MODULES,
	LEGACY_MODULES,
	NOTEBOOK_MODULES,
	isNotebookModule,
	modulesFor,
	parseModules,
	serializeModules
} from './notebook-modules';
import { HIDEABLE_SECTIONS } from './sections';

/**
 * What a notebook holds, and the two lists that decide it.
 *
 * A notebook's own answer, and what the account has put away altogether. The
 * second one winning is the whole reason this reads the menu's preferences
 * rather than keeping a list of its own.
 */
describe('a notebook’s modules', () => {
	test('a notebook nobody has answered for holds notes and tasks', () => {
		expect(parseModules(null)).toEqual([...DEFAULT_MODULES]);
		expect(parseModules(undefined)).toEqual([...DEFAULT_MODULES]);
	});

	test('the list comes back in the app’s order, not the order it was stored in', () => {
		const declared = NOTEBOOK_MODULES.map((m) => m.id);
		const shuffled = 'recipes,tasks,bills,notes';
		const back = parseModules(shuffled);
		expect(back).toEqual(declared.filter((id) => back.includes(id)));
	});

	test('notes survive a list that leaves them out', () => {
		expect(parseModules('bills')).toContain('notes');
		expect(serializeModules([])).toBe('notes');
	});

	test('a key the app no longer has is dropped rather than kept', () => {
		expect(parseModules('notes,seances')).toEqual(['notes']);
		expect(isNotebookModule('seances')).toBe(false);
	});

	test('what the migration writes is what every notebook had before it', () => {
		expect(parseModules(LEGACY_MODULES.join(','))).toEqual([...LEGACY_MODULES]);
	});

	/*
	 * The half that cannot be got wrong quietly: putting Finance away in
	 * Preferences and then finding a Ledgers tab inside a notebook is the
	 * preference not working.
	 */
	test('a room put away account-wide takes its tab with it', () => {
		const stored = 'notes,tasks,bills,ledgers,habits';
		expect(modulesFor(stored, [])).toContain('ledgers');
		expect(modulesFor(stored, ['finance'])).not.toContain('ledgers');
		expect(modulesFor(stored, ['finance'])).not.toContain('bills');
		// One room going away leaves the others where they are.
		expect(modulesFor(stored, ['finance'])).toContain('habits');
	});

	test('hiding a room hides the tabs inside it', () => {
		// Habits is a leaf of Health, so putting the whole room away takes it.
		expect(modulesFor('notes,habits', ['health'])).not.toContain('habits');
	});

	test('a hidden room is only hidden — the notebook still says it holds it', () => {
		expect(parseModules('notes,ledgers')).toContain('ledgers');
		expect(modulesFor('notes,ledgers', ['finance'])).not.toContain('ledgers');
	});

	test('notes is the one nobody can switch off', () => {
		expect(modulesFor('', ['diary', 'notebooks'])).toContain('notes');
	});

	/*
	 * The link back to the menu. A module naming a preference that does not
	 * exist would silently never be hidden, which is the failure that has no
	 * symptom until somebody hides the room and nothing happens.
	 */
	test('every module’s hide preference is one the menu actually has', () => {
		const known = new Set(HIDEABLE_SECTIONS.map((s) => s.id));
		for (const module of NOTEBOOK_MODULES) {
			if ('hide' in module) expect(known.has(module.hide)).toBe(true);
		}
	});

	test('notes is the only one that is always on', () => {
		expect(NOTEBOOK_MODULES.filter((m) => 'always' in m).map((m) => m.id)).toEqual(['notes']);
	});
});
