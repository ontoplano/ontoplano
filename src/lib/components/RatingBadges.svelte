<script lang="ts">
	/**
	 * How urgent, how draining, how wanted — as three little thermometers.
	 *
	 * They were "U4 I3 E2": three letters and three numbers, which is the
	 * information and none of the reading. Then they were frets, which read at
	 * a glance and did not say *what* they were full of. A thermometer does
	 * both: black markings for the five whole steps, and the colour rising
	 * through them like a liquid, so "nearly full" is seen rather than counted.
	 *
	 * The order is `RATING_ORDER` — urgency, ease, interest — which is the
	 * order the Priority sort reads them in and the order they are asked for on
	 * the form. Three gauges in a different order on each screen is three
	 * things to learn instead of one.
	 *
	 * Each carries its own colour so they are told apart without a letter:
	 * urgency yellow, ease blue, interest green. Green rather than the red it
	 * wore — red is the colour of something wrong, and wanting to do a thing is
	 * not — and the words are in the tooltip and in the accessible name,
	 * because a colour on its own is not something everybody can read.
	 *
	 * ## Three, always
	 *
	 * A task with only urgency set used to draw one gauge, so the same question
	 * sat in a different place on every row and the eye had to read each card
	 * from scratch. All three are always here now: an unset one is drawn at
	 * 2.5 of five, in grey — which says "no answer" rather than "the lowest
	 * answer", and lands between the second and third markings rather than on
	 * one of them, so it cannot be mistaken for a number somebody chose. It is
	 * also exactly where an unset rating counts in the Priority sort, so the
	 * picture and the arithmetic make the same claim.
	 */
	import {
		RATING_ORDER,
		RATING_LABELS,
		RATING_MAX,
		RATING_UNRATED,
		type RatingValues
	} from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		values,
		/** Stacked rather than in a row — under the tick box, where the space is. */
		stacked = false,
		class: className = ''
	}: { values: Partial<RatingValues>; stacked?: boolean; class?: string } = $props();

	/** The markings, as something to iterate: the four lines between five steps. */
	const marks = Array.from({ length: RATING_MAX - 1 }, (_, at) => at + 1);
</script>

<span class="gauges {stacked ? 'gauges-stacked' : ''} {className}">
	{#each RATING_ORDER as r (r)}
		{@const value = values[r]}
		{@const said =
			value == null
				? t('ratings.labelNotSet', { label: t(RATING_LABELS[r]) })
				: t('ratings.labelValueOf5', { label: t(RATING_LABELS[r]), value })}
		<span
			class="gauge"
			class:gauge-unset={value == null}
			data-rating={r}
			title={said}
			aria-label={said}
			role="img"
		>
			<!-- The liquid: a fill from the left, in whole steps — or half of one,
			     greyed, where nobody has answered. -->
			<span class="gauge-fill" style="width: {((value ?? RATING_UNRATED) / RATING_MAX) * 100}%"
			></span>
			<!-- And the markings over it, so the level is read against them. -->
			{#each marks as mark (mark)}
				<span class="gauge-mark" style="left: {(mark / RATING_MAX) * 100}%"></span>
			{/each}
		</span>
	{/each}
</span>
