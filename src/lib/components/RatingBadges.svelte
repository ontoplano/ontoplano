<script lang="ts">
	import { RATINGS, RATING_LABELS, type RatingValues } from '$lib/ratings.js';

	let { values, class: className = '' }: { values: Partial<RatingValues>; class?: string } =
		$props();

	// One letter each, because these sit on a card that has better uses for its
	// width. The title spells it out.
	const initial: Record<string, string> = { urgency: 'U', interest: 'I', energy: 'E' };

	const shown = $derived(RATINGS.filter((r) => values[r] != null));
</script>

{#if shown.length > 0}
	<span class="tabular inline-flex items-center gap-1 {className}">
		{#each shown as r (r)}
			<span
				class="border border-gray-200 bg-gray-50 px-1 text-[10px] leading-4 text-gray-600"
				title="{RATING_LABELS[r]}: {values[r]} of 5"
			>
				{initial[r]}{values[r]}
			</span>
		{/each}
	</span>
{/if}
