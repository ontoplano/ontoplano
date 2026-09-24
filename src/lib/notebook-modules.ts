import type { SectionKey } from './colors.js';
import type { PlainKey } from './i18n/keys.js';
import type { HideableSection } from './sections.js';
import { isHidden } from './sections.js';
import type { IconName } from './components/Icon.svelte';
import { glyphFor } from './glyphs.js';

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
	{ id: 'notes', name: 'app.notes', section: 'diary', always: true },
	{ id: 'tasks', name: 'app.tasks', section: 'planner' },
	{ id: 'goals', name: 'app.goals', section: 'goals', hide: 'goals' },
	{ id: 'ideas', name: 'sections.ideas.label', section: 'ideas', hide: 'ideas' },
	{
		id: 'inventory',
		name: 'sections.inventory.label',
		section: 'inventory',
		hide: 'inventory'
	},
	{
		id: 'ledgers',
		name: 'rooms.finance.tabs.ledgers',
		section: 'finance',
		hide: 'finance'
	},
	{
		id: 'bills',
		name: 'rooms.finance.tabs.bills',
		section: 'finance',
		hide: 'finance'
	},
	{
		id: 'habits',
		name: 'sections.habits.label',
		section: 'health',
		hide: 'habits'
	},
	{
		id: 'workouts',
		name: 'sections.workouts.label',
		section: 'health',
		hide: 'workouts'
	},
	{
		id: 'recipes',
		name: 'sections.recipes.label',
		section: 'health',
		hide: 'recipes'
	}
] as const satisfies readonly {
	id: string;
	/** What it is called — a message key, never a word. See `sections-nav.ts`. */
	name: PlainKey;
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
 * A module's glyph, from the one list rather than from beside its name.
 *
 * `$lib/glyphs` holds every glyph the navigation draws, keyed by what the
 * caller already knows the thing as — so `goals` the room and `goals` the
 * notebook tab are one entry and cannot drift into two pictures. The section
 * is the fallback, which is what a module without one of its own should wear:
 * its room's.
 */
export function moduleGlyph(id: NotebookModule): IconName | undefined {
	const meta = moduleMeta(id);
	return glyphFor(id, meta.section);
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
/**
 * What a notebook holds, in the order it holds it.
 *
 * The stored order is the notebook's own: a renovation is mostly a list of
 * things to buy and a trip is mostly a list of things to book, and a tab strip
 * that always opens on the same tab in the same place is one this file decided
 * rather than the person. Both of these used to sort by `NOTEBOOK_MODULES`,
 * which quietly threw an ordering away on every read and every write.
 *
 * Anything stored that this version has never heard of is dropped, and a
 * module that is always there is added at the end if a stored list somehow
 * lacks it — added rather than forced to the front, because Notes being first
 * is a default and not a rule: a renovation whose first tab is its shopping is
 * a notebook somebody has arranged.
 */
export function parseModules(stored: string | null | undefined): NotebookModule[] {
	if (stored === null || stored === undefined) return [...DEFAULT_MODULES];
	return ordered(stored.split(',').map((part) => part.trim()));
}

/** The list, in the order given, ready to store. Notes is always in it. */
export function serializeModules(ids: readonly string[]): string {
	return ordered(ids).join(',');
}

/** A list of ids as this version knows them: real, unrepeated, always-ons first. */
function ordered(ids: readonly string[]): NotebookModule[] {
	const known = new Set(NOTEBOOK_MODULES.map((m) => m.id as string));
	const out: NotebookModule[] = [];
	for (const id of ids)
		if (known.has(id) && !out.includes(id as NotebookModule)) out.push(id as NotebookModule);

	const always = NOTEBOOK_MODULES.filter((m) => 'always' in m).map((m) => m.id);
	return [...out, ...always.filter((id) => !out.includes(id))];
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

/**
 * Every module a notebook may be offered, with this notebook's answer.
 *
 * Pure, and computed from a notebook the page already has: the list and the
 * single-notebook page both draw the same Edit dialog, and one of them had no
 * "what it holds" at all because the server had only been asked for it on the
 * other. A dialog that offers different fields depending on which pencil you
 * pressed is the drift `NotebookFields` exists to prevent.
 *
 * A module whose room this account has put away is left out altogether. It
 * would be a switch that changes nothing on screen, and the honest place to
 * answer for it is Preferences, where the room itself was put away. What was
 * stored for it is not lost: the server carries hidden modules over untouched.
 */
export function moduleChoicesOf(
	notebook: { modules: readonly NotebookModule[]; counts: Record<NotebookModule, number> },
	hiddenSections: readonly string[] = []
): { id: NotebookModule; name: PlainKey; always: boolean; on: boolean; held: number }[] {
	const on = new Set(notebook.modules);
	/*
	 * The notebook's own order first, then everything it does not hold.
	 *
	 * The dialog is where the order is set, so it has to be the order the
	 * dialog shows. A module that is off has no tab and so no place in the
	 * order; it waits at the end in this file's order, and takes a place when
	 * it is switched on — the same arrangement Preferences gives a room that
	 * has been put away.
	 */
	const offered = [
		...notebook.modules
			.map((id) => NOTEBOOK_MODULES.find((m) => m.id === id))
			.filter((m) => m !== undefined),
		...NOTEBOOK_MODULES.filter((m) => !on.has(m.id))
	];

	return offered
		.filter((m) => !('hide' in m && m.hide) || !isHidden(hiddenSections, m.hide))
		.map((m) => ({
			id: m.id,
			name: m.name,
			always: 'always' in m,
			on: on.has(m.id),
			// Counted whether or not it is switched on: turning a module off is one
			// tab fewer, not four things deleted, and the row has to say so.
			held: notebook.counts[m.id] ?? 0
		}));
}
