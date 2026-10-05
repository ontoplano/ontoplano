/**
 * How the diary is sorted, and which way round.
 *
 * A diary is read newest first, and "newest" has two meanings: when an entry
 * was written, and the day it is about — a Sunday entry about Friday belongs
 * with Friday. The third order is the one a notebook's notes also offer: what
 * was touched last.
 *
 * Kept in the browser, like a notebook's note order: a way of looking at a
 * list, not a fact about the account.
 */
export const DIARY_ORDERS = ['written', 'day', 'edited'] as const;
export type DiaryOrder = (typeof DIARY_ORDERS)[number];
export type DiaryDirection = 'asc' | 'desc';

export const DEFAULT_DIARY_ORDER: DiaryOrder = 'written';
/** Every order opens newest first, which is how a diary is read. */
export const DEFAULT_DIARY_DIRECTION: DiaryDirection = 'desc';

export function isDiaryOrder(value: unknown): value is DiaryOrder {
	return typeof value === 'string' && (DIARY_ORDERS as readonly string[]).includes(value);
}

export function isDiaryDirection(value: unknown): value is DiaryDirection {
	return value === 'asc' || value === 'desc';
}

type Sortable = {
	id: number;
	createdAt: string;
	updatedAt?: string | null;
	forDate?: string | null;
};

/** The key an entry sorts by; the id breaks ties, so equals never swap between renders. */
function keyOf(entry: Sortable, order: DiaryOrder): string {
	if (order === 'edited') return entry.updatedAt ?? entry.createdAt;
	if (order === 'day') return entry.forDate ?? entry.createdAt.slice(0, 10);
	return entry.createdAt;
}

export function orderDiary<T extends Sortable>(
	entries: T[],
	order: DiaryOrder,
	direction: DiaryDirection
): T[] {
	const sign = direction === 'desc' ? -1 : 1;
	return [...entries].sort((a, b) => {
		const byKey = keyOf(a, order).localeCompare(keyOf(b, order));
		if (byKey !== 0) return sign * byKey;
		// The day an entry is for ties often: within one day, the order written.
		if (order === 'day') {
			const written = a.createdAt.localeCompare(b.createdAt);
			if (written !== 0) return sign * written;
		}
		return sign * (a.id - b.id);
	});
}
