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

/**
 * `todo:shoes`, `in:kitchen tiles`.
 *
 * One box over ten kinds is fast to reach and slow to read once you have a few
 * hundred of everything: the answer to "where did I write that" arrives with
 * nine other answers around it. A prefix narrows it before the query runs
 * rather than after, and the two narrowings worth having are *what kind of
 * thing* and *which notebook*.
 *
 * Anything that is not a recognised prefix stays part of the text, so a note
 * about `http://example.com` still searches for itself.
 */
export type ParsedQuery = {
	/** Null means every kind. */
	kinds: SearchKind[] | null;
	/** The notebook named after `in:`, if any. Matched by prefix, case-insensitively. */
	notebook: string | null;
	/** What is left to actually search for. */
	text: string;
};

/** Prefixes that name a kind, including the plurals people type by reflex. */
const KIND_ALIASES: Record<string, SearchKind[]> = {
	entry: ['entry'],
	entries: ['entry'],
	diary: ['entry', 'note'],
	note: ['note'],
	notes: ['note'],
	notebook: ['notebook'],
	notebooks: ['notebook'],
	todo: ['todo'],
	todos: ['todo'],
	task: ['todo'],
	tasks: ['todo'],
	block: ['block'],
	blocks: ['block'],
	goal: ['goal'],
	goals: ['goal'],
	idea: ['idea'],
	ideas: ['idea'],
	person: ['person'],
	people: ['person'],
	shopping: ['shopping'],
	buy: ['shopping'],
	activity: ['activity'],
	activities: ['activity']
};

export const SEARCH_PREFIXES = [...Object.keys(KIND_ALIASES), 'in'].sort();

export function parseQuery(raw: string): ParsedQuery {
	let kinds: SearchKind[] | null = null;
	let notebook: string | null = null;
	const words: string[] = [];

	for (const word of String(raw ?? '')
		.trim()
		.split(/\s+/)) {
		const at = word.indexOf(':');
		// A leading colon is punctuation, never a prefix.
		if (at <= 0) {
			if (word) words.push(word);
			continue;
		}

		const head = word.slice(0, at).toLowerCase();
		const tail = word.slice(at + 1);

		// A trailing colon counts only when the word before it is a prefix people
		// mean — otherwise "why: because" loses its first word.
		if (head === 'in' && tail) {
			notebook = tail;
			continue;
		}

		const named = KIND_ALIASES[head];
		if (named && !tail.includes(':')) {
			kinds = [...new Set([...(kinds ?? []), ...named])];
			if (tail) words.push(tail);
			continue;
		}

		words.push(word);
	}

	return { kinds, notebook, text: words.join(' ') };
}
