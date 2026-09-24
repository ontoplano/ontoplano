<script lang="ts">
	/**
	 * How urgent, how easy, how wanted — as three nested bars.
	 *
	 * They were "U4 I3 E2": three letters and three numbers, which is the
	 * information and none of the reading. Then little horizontal thermometers,
	 * which read better and cost a row of the card each. Then three bars of
	 * equal width side by side, which is most of the idea.
	 *
	 * This is the rest of it: the bars nest. Urgency is the widest and sits
	 * behind, ease is narrower in front of it, interest is narrowest in front
	 * of that — all three standing on one baseline and sharing a right edge, so
	 * the group is one object about the size of a thumbnail. **Width says which
	 * rating; height says its value.** A row of separate bars needs the eye to
	 * count positions before it can read anything; nested, the one at the back
	 * is always urgency wherever your eye lands.
	 *
	 * Nothing else is drawn — no outline, no gradient, no marks between the
	 * steps. At this size all three were texture rather than information.
	 *
	 * The order is `RATING_ORDER` — urgency, ease, interest — which is the
	 * order the Priority sort reads them in and the order the form asks for
	 * them. Back to front is that same order, so there is one thing to learn.
	 *
	 * ## One scale, on every row
	 *
	 * The height is fixed. It used to be whatever was left in the rail, so a
	 * three-line card drew a taller 4 than a one-line card did — the same
	 * answer at two sizes, which makes the one thing these are for, comparing
	 * rows against each other, impossible. A 5 is the same number of pixels on
	 * every card in the list.
	 *
	 * ## Three, always
	 *
	 * A task with only urgency set used to draw one gauge, so the same question
	 * sat in a different place on every row and the eye had to read each card
	 * from scratch. All three are always here, and one nobody has answered
	 * stands at half height — which is where an unset rating actually counts
	 * when the list is sorted by Priority, so what is drawn and what is
	 * computed are the same claim.
	 *
	 * In its own colour, though, not grey. A grey bar among two coloured ones
	 * is a third thing to work out on every row, and the answer it gives —
	 * "2.5, because nobody said" — is the same answer the sort uses. The
	 * distinction is worth drawing where somebody is actually setting the
	 * number, which is the picker in the form; `Gauge` still greys it there.
	 *
	 * ## The ground says how big a 5 is
	 *
	 * Behind them, the whole rectangle the widest bar would fill at 5, in a
	 * wash. Without it a short bar is a short bar against nothing and there is
	 * no telling a 1 from a 2 without another row to compare against; with it
	 * every bar is read against the same box.
	 *
	 * The ground reaches one column further left than the bars do, and that
	 * strip of it is never covered. A task rated 5 for urgency filled the box
	 * edge to edge and left no ground showing at all — so the row where the
	 * ruler disappears is the row that looks most like every other one. A
	 * column wide, so it reads as part of the group and not as a rule beside
	 * it.
	 *
	 * ## One target
	 *
	 * The group is read as one object and is pressed as one: whoever wants to
	 * change any of them wants the three together, and three targets a few
	 * pixels wide is a row of things to miss. The caller wraps it in the
	 * button; `ratingSummary` is what that button says on hover.
	 */
	import {
		RATING_MAX,
		RATING_ORDER,
		RATING_UNRATED,
		ratingSummary,
		type RatingValues
	} from '$lib/ratings.js';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		values,
		/** Kept for the callers that ask for it; the group nests either way. */
		stacked = false,
		class: className = ''
	}: { values: Partial<RatingValues>; stacked?: boolean; class?: string } = $props();

	/**
	 * What the three say, in words.
	 *
	 * Carried here rather than by whoever draws it: the board draws these on a
	 * card with nothing around them, and when the per-bar titles went the way
	 * of the per-bar gauges that card stopped saying its numbers at all — on
	 * hover and to a screen reader alike. A caller that wraps this in a button
	 * gives that button its own name for what pressing does; this stays the
	 * name of what is drawn.
	 */
	const said = $derived(ratingSummary(values, t as never));

	/** How tall a bar stands, as a percentage of the group. */
	const heightOf = (value: number | null | undefined) =>
		((value ?? RATING_UNRATED) / RATING_MAX) * 100;

	/**
	 * How wide the nth bar is, as a percentage of the group.
	 *
	 * Even steps down to the last one, so each shows a sliver exactly as wide
	 * as the narrowest bar — three equal thirds for the three there are. Any
	 * finer and the slivers stop being a width you can tell apart, which is the
	 * whole of how you know which bar is which.
	 */
	const widthOf = (at: number) => ((RATING_ORDER.length - at) * 100) / RATING_ORDER.length;
</script>

<span
	class="rating-bars {stacked ? 'rating-bars-stacked' : ''} {className}"
	role="img"
	title={said}
	aria-label={said}
>
	<!--
		The bars stand in their own box on the right, so the widths below stay
		percentages of what a 5 fills rather than of the group plus its strip.
	-->
	<span class="rating-stack">
		{#each RATING_ORDER as r, at (r)}
			<span
				class="rating-bar"
				data-rating={r}
				style="width: {widthOf(at)}%; height: {heightOf(values[r])}%; z-index: {at + 1}"
			></span>
		{/each}
	</span>
</span>

<style>
	/*
	 * The group. Every bar is positioned from the same bottom-right corner, so
	 * they share a baseline and a right edge and the widths do the nesting.
	 */
	.rating-bars {
		/* One scale for every row in the list — see the note above. */
		--bars-height: 2.25rem;
		--bars-width: 1.5rem;
		/* One bar's worth: three of them nest across `--bars-width`. */
		--bars-column: calc(var(--bars-width) / 3);

		position: relative;
		display: inline-block;
		width: calc(var(--bars-width) + var(--bars-column));
		height: var(--bars-height);
		flex: none;
		/*
		 * The box a 5 on every rating would fill.
		 *
		 * Faint: it is a ruler rather than a fourth shape, and the bars have to
		 * stay the thing you see. A token rather than a mix of whatever is
		 * behind it, because the rows alternate two grounds and the selected one
		 * is a third — one wash that reads on all of them. It has an answer per
		 * theme: the grey that is one step above a card in the light theme is
		 * within a hair of the card in the dark one, which left the gauges
		 * standing on nothing. See `--gauge-ground`.
		 */
		background-color: var(--gauge-ground, var(--color-gray-200));
		border-radius: 2px;
	}

	/*
	 * What a 5 on every rating would fill: the right-hand part of the group,
	 * with the strip of ground that is always showing to the left of it.
	 */
	.rating-stack {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: var(--bars-width);
	}

	/*
	 * Every bar from the same bottom-right corner.
	 *
	 * They shared a left edge first, which put the narrowest one — interest —
	 * over the left of the other two and left the widest showing only on the
	 * right. Anchored right, the slivers fall on the left where the eye starts.
	 */
	.rating-bar {
		position: absolute;
		right: 0;
		bottom: 0;
		border-radius: 2px;
		background-color: var(--rating-ink);
	}
</style>
