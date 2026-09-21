<script lang="ts">
	/**
	 * How urgent, how wanted, how draining — as three little gauges.
	 *
	 * They were "U4 I3 E2": three letters and three numbers, which is the
	 * information and none of the reading. A number has to be decoded; a bar
	 * that is nearly full is read without being read, and three of them beside
	 * each other answer "what can I actually do right now" at a glance, which
	 * is the entire reason the app asks these three questions.
	 *
	 * Frets rather than a smooth fill, because the scale is five whole steps
	 * and a continuous bar invites somebody to guess at 3.5. Each gauge carries
	 * its own colour so the three are told apart without a letter: urgency is
	 * yellow, interest red, energy blue. The words are in the tooltip, and in
	 * the accessible name, because a colour on its own is not something
	 * everybody can read.
	 */
	import { RATINGS, RATING_LABELS, RATING_MAX, type RatingValues } from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { values, class: className = '' }: { values: Partial<RatingValues>; class?: string } =
		$props();

	const shown = $derived(RATINGS.filter((r) => values[r] != null));

	/** The frets, as something to iterate: 1..5. */
	const steps = Array.from({ length: RATING_MAX }, (_, at) => at + 1);
</script>

{#if shown.length > 0}
	<span class="inline-flex items-center gap-1.5 {className}">
		{#each shown as r (r)}
			{@const said = t('ratings.labelValueOf5', {
				label: t(RATING_LABELS[r]),
				value: values[r] ?? 0
			})}
			<span class="gauge" data-rating={r} title={said} aria-label={said} role="img">
				{#each steps as step (step)}
					<span class="fret" class:lit={step <= (values[r] ?? 0)}></span>
				{/each}
			</span>
		{/each}
	</span>
{/if}
