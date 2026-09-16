<script lang="ts">
	import { useT } from '$lib/i18n';

	const t = useT();
	import {
		RATING_HINTS,
		RATING_LABELS,
		RATING_MAX,
		RATING_MIN,
		RATING_SCALE_ENDS,
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
	 * The stop below the scale, which is the dot — a real answer, and the one
	 * the slider starts on. Taken from the scale rather than written as 0, so an
	 * off always sits immediately to the left of wherever the scale begins.
	 */
	const OFF = RATING_MIN - 1;

	const ends = $derived(RATING_SCALE_ENDS[rating]);
	const shown = $derived(value ?? OFF);

	/** How much of the track is behind the thumb, for the filled part. */
	const filled = $derived(((shown - OFF) / (RATING_MAX - OFF)) * 100);

	function slide(event: Event) {
		const n = Number((event.currentTarget as HTMLInputElement).value);
		value = n === OFF ? null : n;
	}
</script>

<!-- The value travels as a normal form field, so this works inside any form
     without extra wiring. Empty string means "unrated". -->
<input type="hidden" {name} value={value ?? ''} />

<div class={compact ? 'flex items-center gap-2' : 'space-y-1'}>
	{#if compact}
		<span class="eyebrow w-16 shrink-0 text-gray-600">{RATING_LABELS[rating]}</span>
	{:else}
		<div>
			<div class="eyebrow whitespace-nowrap text-gray-600">{RATING_LABELS[rating]}</div>
			<div class="text-xs leading-tight text-gray-500">{RATING_HINTS[rating]}</div>
		</div>
	{/if}

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<!--
			The dot is the track's own left end, not a control beside it.

			It sits exactly under where the thumb rests at zero, so "unrated" is the
			thumb parked on the dot rather than a second thing to find. Drawn behind
			the input, which paints its thumb over it.
		-->
			<div class="relative min-w-0 flex-1">
				<span aria-hidden="true" class="rating-off"></span>

				<input
					type="range"
					min={OFF}
					max={RATING_MAX}
					step="1"
					value={shown}
					oninput={slide}
					aria-label={RATING_LABELS[rating]}
					aria-valuetext={value === null ? t('ratingPicker.notSet') : `${value} of ${RATING_MAX}`}
					title={value === null
						? `${RATING_LABELS[rating]}: not answered`
						: `${RATING_LABELS[rating]}: ${value} of ${RATING_MAX} — drag to the dot to leave it unanswered`}
					class="rating-slide relative w-full"
					style="--filled: {filled}%"
				/>
			</div>

			<!--
			The number, and the way out of answering.

			Dragging to the dot clears it and always did, and a gesture nobody can
			see is not an answer to "how do I leave this one blank" — so the way out
			is also a button, labelled, reachable by tab and big enough for a thumb.
			Both the number and the button keep their place whether or not there is
			a value, so nothing on the row moves as the slider does.
		-->
			<span class="tabular w-3 shrink-0 text-right text-xs text-gray-700">
				{value ?? '–'}
			</span>

			<button
				type="button"
				onclick={() => (value = null)}
				disabled={value === null}
				title="Leave {RATING_LABELS[rating].toLowerCase()} unanswered"
				aria-label="Leave {RATING_LABELS[rating].toLowerCase()} unanswered"
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
	 * A range input, wearing this app's clothes.
	 *
	 * Every browser draws its own and none of them can be styled through the
	 * shared parts, so the track and the thumb are written out per engine. The
	 * filled part is a gradient on the track rather than a second element,
	 * which is what keeps this one input rather than a construction.
	 */
	/* Under the thumb's resting place at zero — half a thumb in from the left,
	   which is where a range input centres its thumb at the minimum. */
	.rating-off {
		position: absolute;
		left: 0.4375rem;
		top: 50%;
		width: 0.25rem;
		height: 0.25rem;
		margin: -0.125rem 0 0 -0.125rem;
		border-radius: 9999px;
		background: var(--color-gray-400);
	}

	.rating-slide {
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		height: 1.25rem;
		cursor: pointer;
	}

	.rating-slide::-webkit-slider-runnable-track {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--color-gray-900) var(--filled),
			var(--color-gray-300) var(--filled)
		);
	}
	.rating-slide::-moz-range-track {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--color-gray-900) var(--filled),
			var(--color-gray-300) var(--filled)
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

	/* Unanswered: the thumb is hollow, so a slider sitting at the dot does not
	   read as a deliberate "lowest". */
	.rating-slide[aria-valuetext='not set']::-webkit-slider-thumb {
		background: var(--color-gray-100);
		box-shadow: inset 0 0 0 2px var(--color-gray-400);
	}
	.rating-slide[aria-valuetext='not set']::-moz-range-thumb {
		background: var(--color-gray-100);
		box-shadow: inset 0 0 0 2px var(--color-gray-400);
	}

	.rating-slide:focus-visible {
		outline: 2px solid var(--color-gray-900);
		outline-offset: 2px;
	}
</style>
