<script lang="ts">
	/**
	 * The three ratings as a small table: each one's icon, its word and its
	 * number. Drawn wherever the numbers are said beside the bars — the box
	 * holding a change on a card, the phone's rating sheet, the tip on hover —
	 * so the three agree.
	 *
	 * Where the numbers are being changed, `onunset` adds the way back to no
	 * answer beside each one — the bars have no gesture for it, since an unset
	 * rating rests in the middle of the scale rather than off its end.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { useT } from '$lib/i18n';
	import {
		RATING_ICONS,
		RATING_LABELS,
		RATING_ORDER,
		type Rating,
		type RatingValues
	} from '$lib/ratings';

	let { values, onunset }: { values: Partial<RatingValues>; onunset?: (rating: Rating) => void } =
		$props();

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
				{#if onunset}
					{@const said = t('ratingPicker.leaveUnanswered', {
						rating: t(RATING_LABELS[rating]).toLowerCase()
					})}
					<td class="py-0.5 pl-2">
						<!-- Kept in place when there is nothing to clear, so the table
						     does not change width as a value comes and goes. -->
						<button
							type="button"
							class="-my-1 flex items-center px-1 py-1 opacity-70 hover:opacity-100 disabled:invisible"
							disabled={values[rating] === null || values[rating] === undefined}
							onclick={() => onunset(rating)}
							title={said}
							aria-label={said}
						>
							<Icon name="close" size={12} />
						</button>
					</td>
				{/if}
			</tr>
		{/each}
	</tbody>
</table>
