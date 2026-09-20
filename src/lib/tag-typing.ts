import { matchScore } from '$lib/destinations';
import { parseTags } from '$lib/services/tags';

/**
 * Typing tags into a box, as three small questions.
 *
 * The server has always split on commas and spaces — `parseTags` — so "work
 * urgent" was two tags the moment it was saved. The box never said so: it
 * looked like one long string right up until it was submitted, and there was
 * no way to find out which words the account already used without opening
 * something else that had them on it.
 *
 * So the same rules are answered while the typing happens: what is already
 * settled, what is being typed now, and which existing tags that could be.
 *
 * Kept out of the component and out of the service: a pure function is the
 * only way to pin "urgent" suggests `urgent-ish` but not `gut` without
 * standing a browser up, and it is the same answer the server will reach.
 */

/** How many suggestions to offer. More than a glance is a list to read. */
export const MAX_SUGGESTIONS = 6;

/** What counts as the end of a tag while somebody is typing. */
const SEPARATOR = /[,\s]/;

/**
 * The tags that are settled, and the part still being typed.
 *
 * A trailing separator means the last word is finished — "work " is one tag
 * and an empty draft, not a draft of "work". That is what lets a space turn
 * the word you just typed into a chip.
 */
export function splitTyping(raw: string): { settled: string[]; draft: string } {
	const endsOpen = raw.length > 0 && !SEPARATOR.test(raw[raw.length - 1]);
	if (!endsOpen) return { settled: parseTags(raw), draft: '' };

	const cut = Math.max(raw.lastIndexOf(','), raw.lastIndexOf(' '), raw.lastIndexOf('\t'));
	const head = cut === -1 ? '' : raw.slice(0, cut);
	const draft = raw.slice(cut + 1).replace(/^#+/, '');
	return { settled: parseTags(head), draft };
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
	const wanted = draft.trim().toLowerCase();

	return known
		.filter((name) => !taken.has(name.toLowerCase()))
		.map((name) => ({ name, score: matchScore(name, wanted) }))
		.filter((row): row is { name: string; score: number } => row.score !== null)
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
		.slice(0, MAX_SUGGESTIONS)
		.map((row) => row.name);
}

/**
 * The box's text with `tag` put on the end, ready for the next word.
 *
 * Ends with a separator on purpose: choosing a suggestion should leave the
 * caret able to type the next tag straight away rather than inside the one
 * just chosen.
 */
export function withTag(raw: string, tag: string): string {
	const { settled } = splitTyping(raw);
	const already = new Set(settled.map((one) => one.toLowerCase()));
	if (already.has(tag.toLowerCase())) return `${settled.join(', ')}, `;
	return `${[...settled, tag].join(', ')}, `;
}

/** The box's text with `tag` taken off it. */
export function withoutTag(raw: string, tag: string): string {
	const kept = parseTags(raw).filter((one) => one.toLowerCase() !== tag.toLowerCase());
	return kept.length > 0 ? `${kept.join(', ')}, ` : '';
}
