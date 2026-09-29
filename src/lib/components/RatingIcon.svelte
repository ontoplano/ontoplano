<script lang="ts">
	/**
	 * A rating's glyph in place of its name — or all three, in order.
	 *
	 * The name stays on the slider that sets it; everywhere else the icon
	 * stands alone, and the word is still its tooltip and what a screen reader
	 * says. Given no `rating`, it draws the three in `RATING_ORDER`, which is
	 * how a disclosure over the three sliders is labelled.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { RATING_ICONS, RATING_LABELS, RATING_ORDER, type Rating } from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		rating,
		size = 14,
		class: klass = ''
	}: { rating?: Rating; size?: number; class?: string } = $props();

	const shown = $derived(rating ? [rating] : RATING_ORDER);
</script>

<span class="inline-flex items-center gap-1 align-middle {klass}">
	{#each shown as one (one)}
		{@const word = t(RATING_LABELS[one])}
		<span class="inline-flex" title={word} data-rating-icon={one}>
			<Icon name={RATING_ICONS[one]} {size} label={word} />
		</span>
	{/each}
</span>
