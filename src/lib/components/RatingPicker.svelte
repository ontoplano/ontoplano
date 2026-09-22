<script lang="ts">
	import { useT } from '$lib/i18n';

	const t = useT();
	import {
		RATING_HINTS,
		RATING_LABELS,
		RATING_MAX,
		RATING_MIN,
		RATING_SCALE_ENDS,
		RATING_UNRATED,
		type Rating
	} from '$lib/ratings.js';

	/**
	 * One of the three questions a task answers besides "when".
	 *
	 * It was five numbered buttons, which is five targets to hit for one answer
	 * on a scale — and "none of them" was a sixth press on whichever one was
	 * already on, which nobody would guess. A scale is a slider; this is one,
	 * with **off as its leftmost stop** rather than as a button beside it. So
	 * the whole answer, unrated included, is one gesture on one control:
	 *
	 *     ·———————
	 *     ↑ off   ↑ 5
	 *
	 * A native `<input type="range">` rather than a hand-built track, because
	 * the platform's own is the one that already handles a finger, a mouse, the
	 * arrow keys, Home and End, and a screen reader — and because a bespoke
	 * drag on a phone takes the gesture the page needs for scrolling.
	 */
	let {
		rating,
		value = $bindable(null),
		name = rating,
		compact = false
	}: {
		rating: Rating;
		value?: number | null;
		/** Form field name; defaults to the rating's own name. */
		name?: string;
		compact?: boolean;
	} = $props();

	/**
	 * Where the thumb rests when nobody has answered: the middle, at 2.5.
	 *
	 * It used to rest on a dot off the left end of the scale, which put "no
	 * answer" and "the lowest answer" next door to each other and made an
	 * unanswered question look like a one. The middle is where an unset rating
	 * actually counts when the list is sorted, and where the gauge on the card
	 * draws it — so the control, the card and the arithmetic all say the same
	 * thing, and 1 is a real answer again.
	 */
	const ends = $derived(RATING_SCALE_ENDS[rating]);
	const shown = $derived(value ?? RATING_UNRATED);

	/** Where a value sits along the scale, nought to one. */
	const along = (v: number) => (v - RATING_MIN) / (RATING_MAX - RATING_MIN);

	/** How much of the track is behind the thumb, for the filled part. */
	const filled = $derived(along(shown) * 100);

	/**
	 * Every stop the control can hold: the six answers, and no-answer between
	 * two and three.
	 */
	const STOPS = [
		...Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, at) => RATING_MIN + at),
		RATING_UNRATED
	].sort((a, b) => a - b);

	/**
	 * Where to draw the ball for a stop.
	 *
	 * A range input's thumb travels between its own half-widths, not the whole
	 * track, so a plain percentage would put the end balls outside where the
	 * thumb can reach by half a thumb each. `--thumb` is the same length the
	 * thumb is drawn at, in one place for both.
	 */
	const atStop = (v: number) => `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${along(v)})`;

	/**
	 * Seven stops: 0 1 2 · 3 4 5, with no answer in the middle.
	 *
	 * The input runs in halves because 2.5 has to be a position it can hold —
	 * and 2.5 is the only half anybody can land on. It is not a rating of two
	 * and a half; it is the absence of one, dead centre with three answers
	 * either side of it, which is exactly where the card draws an unset rating
	 * and where the sort counts it.
	 *
	 * Every other half is a step passing through, and is taken to the whole
	 * number it was heading for — away from where the thumb was. So an arrow
	 * key moves one stop each time wherever it starts: 2 to no-answer to 3, and
	 * 0 to 1 to 2 below it.
	 */
	function slide(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const raw = Number(input.value);
		const was = value ?? RATING_UNRATED;

		if (raw === RATING_UNRATED) {
			value = null;
			return;
		}

		const whole = Number.isInteger(raw) ? raw : raw > was ? Math.ceil(raw) : Math.floor(raw);
		value = Math.min(RATING_MAX, Math.max(RATING_MIN, whole));
		// The thumb sits on the answer rather than between two of them.
		input.value = String(value);
	}
</script>

<!-- The value travels as a normal form field, so this works inside any form
     without extra wiring. Empty string means "unrated". -->
<input type="hidden" {name} value={value ?? ''} />

<!--
	Answered, and wearing the question's own colour.

	The three are told apart by colour on the card; the control that sets them
	says the same thing, so the yellow one on a task is the yellow one on the
	form. A wash rather than the colour itself — this sits behind a label, a
	sentence and a slider, all of which have to stay readable — and only once
	somebody has answered, so the row is quiet until it has something to say.
-->
<div data-rating={rating} class={compact ? 'flex items-center gap-2' : 'space-y-1'}>
	{#if compact}
		<span class="eyebrow w-16 shrink-0 text-gray-600">{t(RATING_LABELS[rating])}</span>
	{:else}
		<div>
			<div class="eyebrow whitespace-nowrap text-gray-600">{t(RATING_LABELS[rating])}</div>
			<div class="text-xs leading-tight text-gray-500">{t(RATING_HINTS[rating])}</div>
		</div>
	{/if}

	<div class="min-w-0 flex-1">
		<!--
			The track, the number and the way out are one thing, so the colour is
			too — it was around the slider alone, which left the number and the ×
			sitting outside the answer they belong to.
		-->
		<div class="rating-row flex items-center gap-2" class:rating-answered={value !== null}>
			<div class="rating-track relative min-w-0 flex-1">
				<!--
					A ball at every stop, and an open one at no-answer.

					The stops are what the scale *is* — seven of them — and a bare
					line says nothing about where they are. The open one is the
					middle: the track stops either side of it rather than running
					through, so "nothing chosen" reads as a gap in the scale rather
					than as a point on it.
				-->
				<span class="rating-anchors" aria-hidden="true">
					{#each STOPS.filter((stop) => stop !== RATING_UNRATED) as stop (stop)}
						<span class="rating-anchor" style="left: {atStop(stop)}"></span>
					{/each}
				</span>

				<input
					type="range"
					min={RATING_MIN}
					max={RATING_MAX}
					step="0.5"
					value={shown}
					oninput={slide}
					aria-label={t(RATING_LABELS[rating])}
					aria-valuetext={value === null ? t('ratingPicker.notSet') : `${value} of ${RATING_MAX}`}
					title={value === null
						? t('ratings.labelNotSet', { label: t(RATING_LABELS[rating]) })
						: t('ratings.labelValueOf5', { label: t(RATING_LABELS[rating]), value })}
					class="rating-slide relative w-full"
					class:is-unset={value === null}
					style="--filled: {filled}%"
				/>

				<!--
					Drawn after the input, so the line stops either side of it
					rather than running through. The thumb only ever reaches this
					point when there is no answer, and then it rests exactly here —
					so the ring covering it is the ring it was already wearing.
				-->
				<span
					aria-hidden="true"
					class="rating-anchor rating-anchor-open"
					style="left: {atStop(RATING_UNRATED)}"
				></span>
			</div>

			<!--
			The number, and the way out of answering.

			There is no gesture for it any more — the thumb's resting place is in
			the middle of the scale, not off the end of it — so this button is the
			only way back to no answer, and it is labelled, reachable by tab and
			big enough for a thumb. Both the number and the button keep their place
			whether or not there is a value, so nothing on the row moves as the
			slider does.
		-->
			<span class="rating-number tabular shrink-0 text-right text-xs">
				{value ?? '–'}
			</span>

			<button
				type="button"
				onclick={() => (value = null)}
				disabled={value === null}
				title={t('ratingPicker.leaveUnanswered', {
					rating: t(RATING_LABELS[rating]).toLowerCase()
				})}
				aria-label={t('ratingPicker.leaveUnanswered', {
					rating: t(RATING_LABELS[rating]).toLowerCase()
				})}
				class="-my-1 shrink-0 px-1.5 py-1 text-sm leading-none text-gray-400 hover:text-gray-900 disabled:invisible"
			>
				×
			</button>
		</div>

		{#if !compact}
			<div class="mt-0.5 flex justify-between text-[10px] text-gray-500">
				<span>{ends[0]}</span>
				<span>{ends[1]}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	/*
	 * The wash behind an answered one. `--rating-ink` is the question's colour,
	 * set once in `layout.css` for the gauge and for this alike.
	 */
	/*
	 * How wide the thumb is drawn, in one place.
	 *
	 * The balls on the track have to line up with where the thumb can actually
	 * come to rest, and a range input's thumb travels between its own
	 * half-widths rather than across the whole track.
	 */
	.rating-row {
		--thumb: 0.875rem;
	}

	/*
	 * The colour covers the control, which is the track, the number and the way
	 * out of answering.
	 *
	 * Behind the whole row it washed the label and the sentence, which are the
	 * parts that have to stay readable. Around the track alone it left the
	 * number and the × outside the answer they belong to. This is the middle:
	 * everything you can operate, and nothing you only read.
	 *
	 * The padding is cancelled by an equal negative margin so that answering a
	 * rating does not move the row it is on.
	 */
	.rating-row {
		/*
		 * Clear of the sentence above it.
		 *
		 * The pill's top edge ran into the descenders of "How soon this has to
		 * happen", which is the line it belongs to — it has to read as beneath
		 * the question rather than as touching it.
		 */
		margin-top: 0.375rem;
		border-radius: 9999px;
		transition: background-color 120ms ease-out;
		/*
		 * Padded, and pulled back by less than it is padded.
		 *
		 * An equal negative margin keeps the row from moving when a rating is
		 * answered, which is what it was for — but the three of these sit in
		 * columns beside each other, and a wash that reaches the full padding
		 * out on both sides touches the next one. Half the horizontal padding
		 * comes back, so there is always a gap between two answered ones.
		 */
		padding: 0.3125rem 0.625rem;
		margin-right: -0.3125rem;
		margin-bottom: -0.3125rem;
		margin-left: -0.3125rem;
	}

	.rating-row.rating-answered {
		background-color: color-mix(in srgb, var(--rating-ink) 22%, transparent);
	}

	.rating-number {
		min-width: 0.75rem;
		color: var(--color-gray-900);
	}

	/*
	 * The stops, drawn on the track under the thumb.
	 *
	 * Under, not over: the thumb has to be able to sit on one and cover it, and
	 * the ball is where the thumb *can* rest rather than a mark beside it.
	 */
	.rating-anchors {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* Over the track, and over the thumb where the two meet. */
	.rating-anchor-open {
		z-index: 1;
		pointer-events: none;
	}

	.rating-anchor {
		position: absolute;
		top: 50%;
		width: 0.375rem;
		height: 0.375rem;
		margin: -0.1875rem 0 0 -0.1875rem;
		border-radius: 9999px;
		background: var(--color-gray-900);
	}

	/*
	 * No-answer: an open ball the line runs into rather than through.
	 *
	 * Its middle is filled from whatever it sits on so the line does not show
	 * inside it, and there is no halo around the outside — the line meets the
	 * ring and stops there, which is what makes the whole control read as one
	 * connected object rather than a track with a bead floating over it.
	 */
	.rating-anchor-open {
		width: 0.6875rem;
		height: 0.6875rem;
		margin: -0.34375rem 0 0 -0.34375rem;
		background: var(--color-white);
		border: 2px solid var(--color-gray-900);
	}

	.rating-row.rating-answered .rating-anchor-open {
		background: color-mix(in srgb, var(--rating-ink) 22%, var(--color-white));
	}

	/*
	 * A range input, wearing this app's clothes.
	 *
	 * Every browser draws its own and none of them can be styled through the
	 * shared parts, so the track and the thumb are written out per engine. The
	 * filled part is a gradient on the track rather than a second element,
	 * which is what keeps this one input rather than a construction.
	 */
	.rating-slide {
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		height: 1.25rem;
		cursor: pointer;
		/*
		 * Block, so the box around it is exactly its own height.
		 *
		 * An input is inline, so the wrapper picked up the line box's descender
		 * space and stood a couple of pixels taller — which put the balls, which
		 * are placed at half the wrapper's height, below the line they mark.
		 */
		display: block;
	}

	/*
	 * One object, in one ink.
	 *
	 * The line, the balls on it, the ring at no-answer and the thumb are all
	 * `--slide-ink`, and the part of the line past the thumb is the same ink at
	 * a quarter rather than a different grey — so the control reads as a single
	 * thing with some of it filled, instead of four greys that happen to touch.
	 */
	.rating-slide {
		--slide-ink: var(--color-gray-900);
	}

	.rating-slide::-webkit-slider-runnable-track {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--slide-ink) var(--filled),
			color-mix(in srgb, var(--slide-ink) 25%, transparent) var(--filled)
		);
	}
	.rating-slide::-moz-range-track {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--slide-ink) var(--filled),
			color-mix(in srgb, var(--slide-ink) 25%, transparent) var(--filled)
		);
	}

	/*
	 * Big enough for a finger, on a control that is two pixels tall.
	 *
	 * The touch target is the input's own height — a fifth of an inch — and the
	 * thumb is what says where to put the finger.
	 */
	.rating-slide::-webkit-slider-thumb {
		appearance: none;
		-webkit-appearance: none;
		width: 0.875rem;
		height: 0.875rem;
		margin-top: -0.375rem;
		border-radius: 9999px;
		background: var(--color-gray-900);
	}
	.rating-slide::-moz-range-thumb {
		width: 0.875rem;
		height: 0.875rem;
		border: 0;
		border-radius: 9999px;
		background: var(--color-gray-900);
	}

	/*
	 * Unanswered: the thumb is hollow, so a slider sitting at the dot does not
	 * read as a deliberate "lowest".
	 *
	 * Keyed on a class, not on `aria-valuetext`. That attribute holds the
	 * *translated* words for "not set", so the selector matched in English and
	 * in no other language — every Portuguese slider drew a solid thumb and an
	 * unanswered one was indistinguishable from a one. A word the app
	 * translates is never a thing the app matches on.
	 */
	.rating-slide.is-unset::-webkit-slider-thumb {
		background: var(--color-gray-100);
		box-shadow: inset 0 0 0 2px var(--color-gray-400);
	}
	.rating-slide.is-unset::-moz-range-thumb {
		background: var(--color-gray-100);
		box-shadow: inset 0 0 0 2px var(--color-gray-400);
	}

	.rating-slide:focus-visible {
		outline: 2px solid var(--color-gray-900);
		outline-offset: 2px;
	}
</style>
