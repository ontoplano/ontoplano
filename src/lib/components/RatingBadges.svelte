<script lang="ts">
	/**
	 * How urgent, how easy, how wanted — as three little thermometers.
	 *
	 * They were "U4 I3 E2": three letters and three numbers, which is the
	 * information and none of the reading. A thermometer is both: black markings
	 * for the whole steps, and the colour rising through them like a liquid.
	 *
	 * The order is `RATING_ORDER` — urgency, ease, interest — which is the order
	 * the Priority sort reads them in and the order they are asked for on the
	 * form. Three gauges in a different order on each screen is three things to
	 * learn instead of one.
	 *
	 * ## Three, always
	 *
	 * A task with only urgency set used to draw one gauge, so the same question
	 * sat in a different place on every row and the eye had to read each card
	 * from scratch. All three are always here now, and `Gauge` draws each of
	 * them — the same component the slider that sets one is built on, so the
	 * thing you read and the thing you drag cannot drift apart.
	 */
	import Gauge from '$lib/components/Gauge.svelte';
	import { RATING_ORDER, type RatingValues } from '$lib/ratings.js';

	let {
		values,
		/** Stacked rather than in a row — under the tick box, where the space is. */
		stacked = false,
		class: className = ''
	}: { values: Partial<RatingValues>; stacked?: boolean; class?: string } = $props();
</script>

<span class="gauges {stacked ? 'gauges-stacked' : ''} {className}">
	{#each RATING_ORDER as r (r)}
		<Gauge rating={r} value={values[r] ?? null} />
	{/each}
</span>
