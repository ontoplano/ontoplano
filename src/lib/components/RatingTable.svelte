<script lang="ts">
	/**
	 * The three ratings as a small table: each one's icon, its word and its
	 * number. Drawn wherever the numbers are said beside the bars — the box
	 * holding a change on a card, the phone's rating sheet, the tip on hover —
	 * so the three agree.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import { RATING_ICONS, RATING_LABELS, RATING_ORDER, type RatingValues } from '$lib/ratings';

	let { values }: { values: Partial<RatingValues> } = $props();

	const t = useT();
</script>

<table class="tabular text-sm">
	<tbody>
		{#each RATING_ORDER as rating (rating)}
			<tr>
				<th class="py-0.5 pr-4 text-left font-normal">
					<span class="inline-flex items-center gap-1.5">
						<Icon name={RATING_ICONS[rating]} size={12} />
						{t(RATING_LABELS[rating])}
					</span>
				</th>
				<td class="py-0.5 text-right">{values[rating] ?? '—'}</td>
			</tr>
		{/each}
	</tbody>
</table>
