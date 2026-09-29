<script lang="ts">
	import { getFilterStrip } from '$lib/filter-strip';

	/**
	 * "12 tasks showing", beside the controls that narrow a list.
	 *
	 * In a slot as wide as the longest it can say: held open by the count of
	 * the whole list, so narrowing it does not change the width and nothing
	 * after it in the strip moves. See `.count-slot`. A phone gets the number
	 * alone.
	 */
	let {
		/** How many the whole list holds. */
		total,
		/** How many are on screen now. */
		shown,
		/** The count in words — `(n) => t('goals.showingCount', { count: n })`. */
		said,
		/** The tooltip, when it has more to say than the count itself. */
		title
	}: {
		total: number;
		shown: number;
		said: (count: number) => string;
		title?: string;
	} = $props();

	/*
	 * The number alone wherever the strip it stands in is folded — the same
	 * rule the order beside it follows — so a list in a narrow panel on a wide
	 * screen keeps its count on the search box's line. Outside a strip, a
	 * phone's width decides.
	 */
	const strip = getFilterStrip();
</script>

<span
	class="tabular count-slot shrink-0 self-center text-xs text-gray-500"
	title={title ?? said(shown)}
>
	{#if strip}
		<span class="count-widest" aria-hidden="true">{strip.folded ? total : said(total)}</span>
		<span>{strip.folded ? shown : said(shown)}</span>
	{:else}
		<span class="count-widest" aria-hidden="true">
			<span class="sm:hidden">{total}</span>
			<span class="hidden sm:inline">{said(total)}</span>
		</span>
		<span>
			<span class="sm:hidden">{shown}</span>
			<span class="hidden sm:inline">{said(shown)}</span>
		</span>
	{/if}
</span>
