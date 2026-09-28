<script lang="ts">
	/**
	 * A category, worn on a row or a card: its name in a pill of its colour.
	 *
	 * The one way the app draws "this belongs to that category". There were
	 * five — a pill, a 3px bar, a 4px bar down a row, a rounded cap on a month
	 * chip, an 8px dot — and a ledger said it twice with a row wash as well.
	 * A bar or a dot beside a name is a footnote: on a list of twenty the
	 * colour is a column of dashes and every row reads the same. The pill
	 * carries the word too, so the colour is never the only cue.
	 *
	 * The ink is worked out from the colour (`pillStyle`), so a pale choice is
	 * not white on white and a dark one is not black on black.
	 *
	 * A card whose whole face is the category — the board's cards — wears
	 * `.pill-soft` instead; this is for a thing that sits on a row.
	 */
	import { pillStyle } from '$lib/pill-ink';
	import { CATEGORY_FALLBACK_COLOR } from '$lib/colors';

	let {
		name,
		color,
		title = undefined,
		class: klass = ''
	}: {
		/** The category's name — the word the colour stands for. */
		name: string;
		/** Its colour; none is the neutral fallback, not an invisible pill. */
		color: string | null | undefined;
		title?: string;
		class?: string;
	} = $props();
</script>

<span class="pill category-mark {klass}" style={pillStyle(color || CATEGORY_FALLBACK_COLOR)} {title}
	><span class="truncate">{name}</span></span
>

<style>
	.category-mark {
		max-width: 100%;
		flex: 0 1 auto;
	}
</style>
