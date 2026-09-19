/**
 * How a notebook's notes are sorted, and which way round.
 *
 * A notebook is a subject being worked through, so its default is the order it
 * was written in — the pages of a real one, beginning at the beginning. That
 * is one answer to one question, and the other two get asked as soon as a
 * notebook has more than a screenful: *where is the one called X* (title), and
 * *what did I touch last* (edited).
 *
 * The field and the direction are separate, which is why this is not the
 * to-do list's single cycling button. Three fields times two directions is six
 * states, and a button somebody has to press five times to get back where they
 * started is a worse control than a picker and an arrow.
 */
export const NOTE_ORDERS = ['written', 'title', 'edited'] as const;
export type NoteOrder = (typeof NOTE_ORDERS)[number];

export const NOTE_DIRECTIONS = ['asc', 'desc'] as const;
export type NoteDirection = (typeof NOTE_DIRECTIONS)[number];

/** Where the choice is kept: a way of looking at a list, not a fact about the account. */
export const NOTE_ORDER_KEY = 'ontoplano:notes-order';
export const NOTE_DIRECTION_KEY = 'ontoplano:notes-direction';

/**
 * The direction a field starts in, which is the one somebody means by it.
 *
 * Ascending is right for the written order and for titles — the beginning of
 * the renovation, and A before B. It is wrong for "edited", where the question
 * is what was touched last, so that one opens the other way round.
 *
 * A function rather than a table keyed by field: a `title:` line holding a
 * string is how this app writes a label, and `check-copy` reads it as one.
 */
export function defaultDirectionFor(order: NoteOrder): NoteDirection {
	return order === 'edited' ? 'desc' : 'asc';
}

export const DEFAULT_NOTE_ORDER: NoteOrder = 'written';

export function isNoteOrder(value: unknown): value is NoteOrder {
	return typeof value === 'string' && (NOTE_ORDERS as readonly string[]).includes(value);
}

export function isNoteDirection(value: unknown): value is NoteDirection {
	return typeof value === 'string' && (NOTE_DIRECTIONS as readonly string[]).includes(value);
}

/** The fields a comparison needs; anything else about a note is irrelevant here. */
export type Sortable = {
	id: number;
	title?: string | null;
	content?: string | null;
	createdAt: string;
	updatedAt?: string | null;
	pinnedAt?: string | null;
};

/**
 * What a note is called when it has not been called anything.
 *
 * The card falls back to the first line for a note with no title, so sorting
 * by title has to fall back to the same thing — otherwise half the list sorts
 * as an empty string and lands in a block at one end, in an order that looks
 * random because it is the order of something the reader cannot see.
 */
export function sortTitle(note: Sortable): string {
	const named = (note.title ?? '').trim();
	if (named) return named;
	const firstLine = (note.content ?? '').trim().split('\n', 1)[0] ?? '';
	return firstLine.trim();
}

function compare(a: Sortable, b: Sortable, order: NoteOrder): number {
	if (order === 'title') {
		// A person's collation, not the code point order: "Ácido" belongs with
		// "acido" rather than after "Zebra", and every catalogue this app ships
		// has words that decide it.
		const byName = sortTitle(a).localeCompare(sortTitle(b), undefined, {
			sensitivity: 'base',
			numeric: true
		});
		if (byName !== 0) return byName;
	} else {
		const key = order === 'edited' ? 'updatedAt' : 'createdAt';
		const left = (a[key] ?? a.createdAt) as string;
		const right = (b[key] ?? b.createdAt) as string;
		const byTime = left.localeCompare(right);
		if (byTime !== 0) return byTime;
	}
	// Two notes written in the same second, or named the same thing. The id is
	// the only thing left that cannot tie, and without it the order of equals
	// changes between renders.
	return a.id - b.id;
}

/**
 * The notes in the order asked for, pinned ones first whatever it is.
 *
 * Pinning says *this one is what the notebook is for*, and a sort that can
 * bury it under an alphabet has taken the pin away. So the pinned ones lead,
 * most recently pinned first — which is what pinning another one means — and
 * the chosen order arranges each half.
 */
export function orderNotes<T extends Sortable>(
	notes: T[],
	order: NoteOrder,
	direction: NoteDirection
): T[] {
	const sign = direction === 'desc' ? -1 : 1;
	return [...notes].sort((a, b) => {
		const pinned = Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt));
		if (pinned !== 0) return pinned;
		if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
		return sign * compare(a, b, order);
	});
}
