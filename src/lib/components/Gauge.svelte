<script lang="ts">
	/**
	 * One rating, under the slider that sets it.
	 *
	 * A flat track with the question's colour filling it, so "nearly full" is
	 * seen rather than counted. It wears the same treatment as the nested bars
	 * a card draws — flat, no outline, no gradient, no markings between the
	 * steps — because the thing being set here is the thing drawn there, and
	 * two different pictures of one number is two things to learn.
	 *
	 * The markings went with the rest of it. They were four black lines over a
	 * bar four pixels tall, which at that size is texture, and the number
	 * itself is written beside the slider anyway.
	 *
	 * An unanswered one is drawn at 2.5 and greyed. That is where the sort
	 * counts it, and here — unlike on a card, where every bar wears its own
	 * colour — the distinction is worth drawing, because this is the screen
	 * where somebody is deciding whether to answer at all.
	 */
	import { RATING_LABELS, RATING_MAX, RATING_UNRATED, type Rating } from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		rating,
		value,
		class: className = ''
	}: { rating: Rating; value: number | null; class?: string } = $props();

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
</span>
