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

	/** How much of the track is behind the thumb, for the filled part. */
	const filled = $derived(((shown - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100);

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
		<div class="flex items-center gap-2">
			<div class="rating-track relative min-w-0 flex-1" class:rating-answered={value !== null}>
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
			<span class="tabular w-3 shrink-0 text-right text-xs text-gray-700">
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
	 * The colour sits around the slider, not behind the whole row.
	 *
	 * Behind the row it washed the label and the sentence as well, which are
	 * the parts that have to stay readable, and left the slider in a white
	 * cut-out — the one thing the colour was meant to be about. Around the
	 * track it reads as the control being answered.
	 *
	 * The padding is cancelled by an equal negative margin so that answering a
	 * rating does not move the row it is on.
	 */
	.rating-track {
		border-radius: 9999px;
		transition: background-color 120ms ease-out;
		padding: 0.3125rem 0.625rem;
		margin: -0.3125rem -0.625rem;
	}

	.rating-track.rating-answered {
		background-color: color-mix(in srgb, var(--rating-ink) 22%, transparent);
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
