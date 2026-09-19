/**
 * Loose matching for a picker somebody is typing into.
 *
 * A `<select>` with forty activities in it is a list you scroll; the way
 * anybody actually finds "learn russian" is by typing three letters of it.
 * `lr` should find it, and so should `russ`, and `learn ru` — which a
 * substring match does not do.
 *
 * Subsequence matching, scored, and deliberately small: no index, no library,
 * no ranking model. The lists this runs over are one person's own activities
 * and categories, which is tens of items, and it runs on a keystroke.
 */

/** A match, with a lower score being a better one, or null for no match. */
export type Match = { score: number; hits: number[] } | null;

/**
 * Where each letter of `needle` landed in `haystack`, or null.
 *
 * Case is ignored and so is whitespace in the query, so "learn ru" and
 * "learnru" ask the same question. The positions come back so the caller can
 * mark them: a filtered list that does not show *why* a row matched reads as
 * a list that has stopped filtering.
 */
export function fuzzyMatch(haystack: string, needle: string): Match {
	const target = haystack.toLowerCase();
	const query = needle.toLowerCase().replace(/\s+/g, '');
	if (query === '') return { score: 0, hits: [] };

	const hits: number[] = [];
	let at = 0;
	for (const ch of query) {
		const found = target.indexOf(ch, at);
		if (found === -1) return null;
		hits.push(found);
		at = found + 1;
	}

	/*
	 * Lower is better, and three things make a match better:
	 *
	 * - how early it starts, so typing "gym" puts "gym" above "morning gym";
	 * - how tightly the letters sit together, so "lr" prefers "lr" in one word
	 *   to two letters a sentence apart;
	 * - how short the whole string is, which breaks ties towards the thing
	 *   with less around it.
	 */
	const start = hits[0];
	const spread = hits[hits.length - 1] - start - (hits.length - 1);
	return { score: start * 2 + spread * 3 + target.length / 100, hits };
}

export type Ranked<T> = { item: T; hits: number[] };

/**
 * The items that match, best first. An empty query matches everything and
 * leaves the order alone — the point of this picker is that it shows what
 * there is before anybody types.
 */
export function fuzzyRank<T>(items: T[], query: string, label: (item: T) => string): Ranked<T>[] {
	if (query.trim() === '') return items.map((item) => ({ item, hits: [] }));

	return items
		.map((item) => ({ item, match: fuzzyMatch(label(item), query) }))
		.filter((row): row is { item: T; match: NonNullable<Match> } => row.match !== null)
		.sort((a, b) => a.match.score - b.match.score)
		.map(({ item, match }) => ({ item, hits: match.hits }));
}

/**
 * A label cut into the parts that matched and the parts that did not, in
 * order, so it can be drawn without any index arithmetic in the markup.
 */
export function markHits(label: string, hits: number[]): { text: string; hit: boolean }[] {
	if (hits.length === 0) return label === '' ? [] : [{ text: label, hit: false }];

	const wanted = new Set(hits);
	const parts: { text: string; hit: boolean }[] = [];
	for (let i = 0; i < label.length; i++) {
		const hit = wanted.has(i);
		const last = parts[parts.length - 1];
		if (last && last.hit === hit) last.text += label[i];
		else parts.push({ text: label[i], hit });
	}
	return parts;
}
