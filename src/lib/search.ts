/**
 * What search returns, in a file both sides can import.
 *
 * The query itself is server-only — it touches every table. The vocabulary is
 * not, and a page that renders results should not have to pull the database in
 * to know what a "note" is called.
 */
export const SEARCH_KINDS = [
	'entry',
	'note',
	'notebook',
	'todo',
	'block',
	'goal',
	'idea',
	'person',
	'shopping',
	'activity'
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export type Hit = {
	kind: SearchKind;
	id: number;
	title: string;
	/** The line the match is on, for context. Empty when the title is the match. */
	snippet: string;
	href: string;
};

export const KIND_LABELS: Record<SearchKind, string> = {
	entry: 'Diary',
	note: 'Notes',
	notebook: 'Notebooks',
	todo: 'Todos',
	block: 'Blocks',
	goal: 'Goals',
	idea: 'Ideas',
	person: 'People',
	shopping: 'Shopping',
	activity: 'Activities'
};

/** Enough to be worth a query; a single letter matches everything. */
export const MIN_QUERY = 2;
