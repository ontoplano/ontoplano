import { matchScore } from '$lib/destinations';
import { parseTags } from '$lib/services/tags';

/**
 * Typing tags into a box.
 *
 * The first version made the input and the chips two views of one string: the
 * chips were whatever the string parsed to, and the input held the string. It
 * could not work. The input never cleared, because clearing it would have
 * deleted the chips — and nothing was ever suggested, because the "word being
 * typed" was whatever trailed the last separator, which after a space is
 * nothing at all. One mistake, both symptoms.
 *
 * So they are two things. The chips are the tags, kept as a list. The input
 * holds only the word being typed and is cleared the moment that word becomes
 * a chip. What the form posts is assembled from the chips, in a hidden field,
 * so the server still receives the one comma-separated string it always did.
 */

/** How many suggestions to offer. More than a glance is a list to read. */
export const MAX_SUGGESTIONS = 6;

/**
 * The tags in a value the form arrived with.
 *
 * `parseTags` is the server's own reading of that string, so what is drawn as
 * chips is exactly what the server would have stored — the box cannot show one
 * thing and save another.
 */
export function tagsFrom(value: string): string[] {
	return parseTags(value);
}

/** What the form posts: the chips, as the one string the server expects. */
export function tagsValue(tags: readonly string[]): string {
	return tags.join(', ');
}

/**
 * The tag a draft becomes, or null if it is not one yet.
 *
 * Trimmed, lower-cased and stripped of a leading `#` — the same shape
 * `parseTags` would give it, so a tag typed by hand and a tag chosen from the
 * list are the same tag. Null for whitespace, and for one already on the box:
 * pressing space twice is not two tags, and re-typing one you already have is
 * not a second copy of it.
 */
export function draftTag(draft: string, already: readonly string[] = []): string | null {
	const [tag] = parseTags(draft);
	if (!tag) return null;
	return already.some((one) => one.toLowerCase() === tag) ? null : tag;
}

/** Whether what was just typed ends the word — a space, a comma, a tab. */
export function endsTag(key: string): boolean {
	return key === ' ' || key === ',' || key === 'Tab' || key === 'Enter';
}

/**
 * Which known tags the draft could be, best first.
 *
 * `matchScore` is the app's own fuzzy — the one the command palette uses — so
 * a tag list behaves like everything else that filters as you type rather than
 * like a second, private idea of what "matching" means. Tags already on the
 * box are left out: offering one you have just chosen is a row that does
 * nothing.
 */
export function suggestTags(
	known: readonly string[],
	draft: string,
	chosen: readonly string[] = []
): string[] {
	const taken = new Set(chosen.map((one) => one.toLowerCase()));
	const wanted = draft.trim().replace(/^#+/, '').toLowerCase();

	return known
		.filter((name) => !taken.has(name.toLowerCase()))
		.map((name) => ({ name, score: matchScore(name, wanted) }))
		.filter((row): row is { name: string; score: number } => row.score !== null)
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
		.slice(0, MAX_SUGGESTIONS)
		.map((row) => row.name);
}
