<script lang="ts">
	/**
	 * How urgent, how easy, how wanted — as three bars of different heights.
	 *
	 * They were "U4 I3 E2": three letters and three numbers, which is the
	 * information and none of the reading. Then they were little horizontal
	 * thermometers, which read better and cost a row of the card each — three
	 * pills stacked under the tick box, each of them mostly empty space, with
	 * outlines and markings and a gradient inside.
	 *
	 * A card has almost no width to spare and a great deal of height. So they
	 * are vertical: three flat bars side by side, and the thing you compare is
	 * the one thing bars are good for. Nothing else is drawn — no outline, no
	 * gradient, no marks between the steps. At this size all three were texture
	 * rather than information, and what somebody reads off a row is which of
	 * the three is tall, not whether one of them is 3 or 4.
	 *
	 * The order is `RATING_ORDER` — urgency, ease, interest — which is the
	 * order the Priority sort reads them in and the order the form asks for
	 * them. Three bars in a different order on each screen is three things to
	 * learn instead of one.
	 *
	 * ## Three, always
	 *
	 * A task with only urgency set used to draw one gauge, so the same question
	 * sat in a different place on every row and the eye had to read each card
	 * from scratch. All three are always here. One nobody has answered is drawn
	 * grey at half height, which is where an unset rating actually counts when
	 * the list is sorted by Priority — so what is drawn and what is computed
	 * are the same claim.
	 *
	 * ## One target
	 *
	 * The group is read as one object and is pressed as one: whoever wants to
	 * change any of them wants the three together, and three targets four
	 * pixels wide is a row of things to miss. The caller wraps it in the
	 * button; `ratingSummary` is what that button says on hover.
	 */
	import { RATING_MAX, RATING_ORDER, RATING_UNRATED, type RatingValues } from '$lib/ratings.js';

	let {
		values,
		/** Kept for the callers that ask for it; the bars stand side by side either way. */
		stacked = false,
		class: className = ''
	}: { values: Partial<RatingValues>; stacked?: boolean; class?: string } = $props();

	/** How tall a bar stands, as a percentage of the track. */
	const heightOf = (value: number | null | undefined) =>
		((value ?? RATING_UNRATED) / RATING_MAX) * 100;
</script>

<span class="rating-bars {stacked ? 'rating-bars-stacked' : ''} {className}" aria-hidden="true">
	{#each RATING_ORDER as r (r)}
		<span class="rating-bar" class:rating-bar-unset={values[r] == null} data-rating={r}>
			<span class="rating-bar-fill" style="height: {heightOf(values[r])}%"></span>
		</span>
	{/each}
</span>

<style>
	/*
	 * The group. `align-items: end` is what makes them bars rather than
	 * columns: every one grows from the same baseline, so their tops are the
	 * comparison and the eye does not have to find each one's bottom first.
	 */
	.rating-bars {
		--bar-width: 5px;
		--bar-gap: 3px;
		/* Enough to read on a one-line task, which is the shortest row there is. */
		--bar-least: 1.75rem;

		display: inline-flex;
		align-items: end;
		gap: var(--bar-gap);
		/*
		 * All of the rail, less the padding.
		 *
		 * They were a fixed 1.75rem in a column that is often three lines tall,
		 * so most of the one part of a card with height to spare was empty and
		 * the difference between a 3 and a 4 was two pixels. The caller gives
		 * this the leftover height under the tick box; this takes it.
		 */
		height: 100%;
		min-height: var(--bar-least);
	}

	/*
	 * The track: the height a 5 would reach, in a wash of the bar's own colour.
	 *
	 * Not an outline — an outline at four pixels wide is most of the bar. The
	 * wash is what tells a 1 apart from a rating that is not drawn at all, and
	 * it is faint enough that the filled part is what anybody actually sees.
	 */
	.rating-bar {
		position: relative;
		display: block;
		width: var(--bar-width);
		height: 100%;
		background-color: color-mix(in srgb, var(--rating-ink) 14%, transparent);
	}

	.rating-bar-fill {
		position: absolute;
		inset: auto 0 0 0;
		background-color: var(--rating-ink);
	}

	/*
	 * Nobody has answered this one.
	 *
	 * Grey and half tall. An empty bar would say "the lowest there is", which
	 * is an answer; a missing one would move the other two around.
	 *
	 * The selector carries `[data-rating]` so it is specific enough to beat the
	 * colours in `layout.css`, which are set on the same attribute — without it
	 * an unset bar kept its own hue and merely went pale, which reads as a low
	 * rating rather than as no rating.
	 */
	.rating-bar[data-rating].rating-bar-unset {
		--rating-ink: var(--color-gray-400);
	}
</style>
