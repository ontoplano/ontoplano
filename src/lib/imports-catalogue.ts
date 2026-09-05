/**
 * Everything ontoplano can bring in, in one list.
 *
 * Three places name these and they drifted the moment a fourth was added: the
 * import page's own copy, the FAQ on ontoplano.com — a different repository,
 * built on a laptop — and this. The site read "Todoist or Google Tasks" for
 * weeks after Google Keep landed, and would have gone on reading it after the
 * Obsidian vault.
 *
 * So the app is the source and `/api/imports` is how anything outside reads it,
 * the same arrangement `/api/pricing` has for the one number that must not be
 * typed twice. `make deploy-site` fetches it at build time.
 *
 * Not under `server/` because the import page is a component.
 */

export type ImportKind = {
	/** Stable, so the site can key off it. */
	id: string;
	/** What the person calls the app they are leaving. */
	name: string;
	/** What they actually have to hand over, in their words. */
	file: string;
	/** What it becomes here — the answer to "where does it go". */
	becomes: 'todos' | 'entries' | 'todos and notes';
};

export const IMPORT_KINDS: ImportKind[] = [
	{ id: 'todoist', name: 'Todoist', file: 'a project exported as CSV', becomes: 'todos' },
	{
		id: 'google-tasks',
		name: 'Google Tasks',
		file: "Takeout's Tasks.json",
		becomes: 'todos'
	},
	{
		id: 'google-keep',
		name: 'Google Keep',
		file: 'the files Takeout writes, one per note',
		becomes: 'todos and notes'
	},
	{ id: 'org', name: 'Org mode', file: 'a .org file', becomes: 'todos and notes' },
	{ id: 'obsidian', name: 'Obsidian', file: "the vault's folder", becomes: 'entries' }
];

/** "Todoist, Google Tasks, Google Keep and Obsidian". */
export function importNames(kinds: ImportKind[] = IMPORT_KINDS): string {
	const names = kinds.map((k) => k.name);
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
