import type { SectionKey } from './colors.js';
import type { PlainKey } from './i18n/keys.js';
import type { HideableSection } from './sections.js';
import { isHidden } from './sections.js';
import type { IconName } from './components/Icon.svelte';

/**
 * What a notebook can hold.
 *
 * A notebook is a subject you keep coming back to — a renovation, a trip, a
 * book — and the things that subject accumulates are not only writing. The
 * kitchen has notes and tasks, and it also has the tiles to buy, the account
 * the payments come out of, the invoices, and the recipe you are eventually
 * going to cook in it. Each of those already has a room; a notebook is the
 * same rows seen from the subject rather than from the room.
 *
 * Every module here names a room that already exists, and it does so through
 * the same identities the menu uses — `section` for its colour, `hide` for the
 * preference that puts it away. That is the point of this list being here and
 * not a second copy: a room somebody has put away account-wide must not come
 * back as a tab inside a notebook, and the only way to be sure of that is to
 * read the same preference the navbar reads. See `sections-nav.ts` for the
 * rooms themselves and `sections.ts` for what can be put away.
 *
 * `notes` has no `hide`, and `always`. A notebook is a place to write against
 * a subject; one that cannot be written in is a filter, not a notebook.
 */
export const NOTEBOOK_MODULES = [
	{ id: 'notes', name: 'app.notes', icon: 'note', section: 'diary', always: true },
	{ id: 'tasks', name: 'app.tasks', icon: 'planner', section: 'planner' },
	{ id: 'goals', name: 'app.goals', icon: 'goals', section: 'goals', hide: 'goals' },
	{ id: 'ideas', name: 'sections.ideas.label', icon: 'ideas', section: 'ideas', hide: 'ideas' },
	{
		id: 'inventory',
		name: 'sections.inventory.label',
		icon: 'shopping',
		section: 'inventory',
		hide: 'inventory'
	},
	{
		id: 'ledgers',
		name: 'rooms.finance.tabs.ledgers',
		icon: 'wallet',
		section: 'finance',
		hide: 'finance'
	},
	{
		id: 'bills',
		name: 'rooms.finance.tabs.bills',
		icon: 'wallet',
		section: 'finance',
		hide: 'finance'
	},
	{
		id: 'habits',
		name: 'sections.habits.label',
		icon: 'health',
		section: 'health',
		hide: 'habits'
	},
	{
		id: 'workouts',
		name: 'sections.workouts.label',
		icon: 'flame',
		section: 'health',
		hide: 'workouts'
	},
	{
		id: 'recipes',
		name: 'sections.recipes.label',
		icon: 'utensils',
		section: 'health',
		hide: 'recipes'
	}
] as const satisfies readonly {
	id: string;
	/** What it is called — a message key, never a word. See `sections-nav.ts`. */
	name: PlainKey;
	icon: IconName;
	/** Whose colour it wears, so a notebook's tabs match the rooms they lead to. */
	section: SectionKey;
	/** The account-wide preference that puts its room away, if it has one. */
	hide?: HideableSection;
	/** Not offered as a choice: a notebook you cannot write in is not a notebook. */
	always?: true;
}[];

export type NotebookModule = (typeof NOTEBOOK_MODULES)[number]['id'];

/**
 * What a new notebook starts with.
 *
 * Notes and tasks, and nothing else. Nine tabs on a notebook somebody made to
 * keep a reading list in is the app deciding what their subject is about; two
 * is a place to write and a place to put what it needs doing, which is what
 * almost every notebook turns out to be. The rest are one switch away in the
 * notebook's own Edit dialog.
 */
export const DEFAULT_MODULES: readonly NotebookModule[] = ['notes', 'tasks'];

/**
 * What a notebook that predates this list holds.
 *
 * Every notebook had notes, tasks and goals, and a migration that quietly
 * applied the new default would take the Goals tab off screens people were
 * using. So the migration writes this, and only notebooks made afterwards get
 * the shorter default.
 */
export const LEGACY_MODULES: readonly NotebookModule[] = ['notes', 'tasks', 'goals'];

export function isNotebookModule(value: unknown): value is NotebookModule {
	return typeof value === 'string' && NOTEBOOK_MODULES.some((m) => m.id === value);
}

export function moduleMeta(id: NotebookModule): (typeof NOTEBOOK_MODULES)[number] {
	return NOTEBOOK_MODULES.find((m) => m.id === id)!;
}

/**
 * The stored list, read back.
 *
 * Stored as one comma-separated string rather than a join table: it is a set
 * of nine known keys belonging to one row, read on every notebook page and
 * written from one dialog. Unknown keys are dropped the way a stored menu
 * order drops a room the app no longer has, and the list comes back in the
 * order this file declares so two notebooks never show their tabs in a
 * different order from each other.
 *
 * `null` means a notebook whose modules have never been written — a new one —
 * and gets the default.
 */
export function parseModules(stored: string | null | undefined): NotebookModule[] {
	if (stored === null || stored === undefined) return [...DEFAULT_MODULES];
	const wanted = new Set(stored.split(',').map((part) => part.trim()));
	return NOTEBOOK_MODULES.filter((m) => 'always' in m || wanted.has(m.id)).map((m) => m.id);
}

/** The list, in this file's order, ready to store. Notes is always in it. */
export function serializeModules(ids: readonly string[]): string {
	const wanted = new Set(ids);
	return NOTEBOOK_MODULES.filter((m) => 'always' in m || wanted.has(m.id))
		.map((m) => m.id)
		.join(',');
}

/**
 * The tabs this notebook actually shows.
 *
 * Two things have to agree: what the notebook was told to hold, and what this
 * account has put away altogether. Hiding Finance in preferences and then
 * finding a Ledgers tab inside a notebook is the preference not working, so
 * the account's answer wins — and because it is only hidden, turning Finance
 * back on brings the tab back with everything still in it.
 */
export function modulesFor(
	stored: string | null | undefined,
	hiddenSections: readonly string[] = []
): NotebookModule[] {
	return parseModules(stored).filter((id) => {
		const meta = moduleMeta(id);
		return !('hide' in meta && meta.hide) || !isHidden(hiddenSections, meta.hide);
	});
}
