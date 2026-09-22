<script lang="ts">
	/**
	 * One rating, as a little thermometer.
	 *
	 * A pill with black markings for the whole steps and the question's colour
	 * rising through them, so "nearly full" is seen rather than counted. It is
	 * the same object on a task's row and under the slider that sets it — one
	 * component rather than two drawings that have to be kept in step, which is
	 * how the row and the form drifted apart the first time.
	 *
	 * An unanswered one is drawn at 2.5 and greyed, markings included: that is
	 * where the sort counts it, and between two markings rather than on one, so
	 * "nobody said" cannot be mistaken for a number somebody chose.
	 */
	import { RATING_LABELS, RATING_MAX, RATING_UNRATED, type Rating } from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		rating,
		value,
		class: className = ''
	}: { rating: Rating; value: number | null; class?: string } = $props();

	/** The markings, as something to iterate: the lines between the whole steps. */
	const marks = Array.from({ length: RATING_MAX - 1 }, (_, at) => at + 1);

	const said = $derived(
		value == null
			? t('ratings.labelNotSet', { label: t(RATING_LABELS[rating]) })
			: t('ratings.labelValueOf5', { label: t(RATING_LABELS[rating]), value })
	);
</script>

<span
	class="gauge {className}"
	class:gauge-unset={value == null}
	data-rating={rating}
	title={said}
	aria-label={said}
	role="img"
>
	<!-- The liquid: a fill from the left, in whole steps — or 2.5 of them,
	     greyed, where nobody has answered. -->
	<span class="gauge-fill" style="width: {((value ?? RATING_UNRATED) / RATING_MAX) * 100}%"></span>
	<!-- And the markings over it, so the level is read against them. -->
	{#each marks as mark (mark)}
		<span class="gauge-mark" style="left: {(mark / RATING_MAX) * 100}%"></span>
	{/each}
</span>
