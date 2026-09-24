<script lang="ts">
	import { useT } from '$lib/i18n';

	const t = useT();
	import Gauge from '$lib/components/Gauge.svelte';
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
		// While a finger or a pointer is down, `fillTo` owns the value: the
		// native control answers "where is the nearest step to this x", and the
		// question a bar answers is "which block did you press".
		if (pressing) return;

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

	/** Whether a pointer is down on the bar, so the pointer decides rather than the input. */
	let pressing = false;

	/**
	 * The native control, kept in step with the answer at every moment.
	 *
	 * While a pointer is down the bar decides and `slide` stands off, so the
	 * input went on holding whatever the native slider had worked out from the
	 * pointer — a different number, because a range puts its thumb on the
	 * *nearest* step and a bar fills up to the block you are on. The event that
	 * arrives as the drag ends then carried that stale number and applied it,
	 * which is the value snapping back a step the moment you let go. It showed
	 * up as "I move them faster, they flick back": moving fast is what puts the
	 * two furthest apart.
	 *
	 * So every answer the bar works out is written straight back into the
	 * input. There is never a second number to come back.
	 *
	 * And the input never sees the pointer at all (`pointer-events: none`
	 * below). Firefox runs its own thumb drag off the mouse, and the capture
	 * the bar takes stole the mouseup that ends it: the drag never finished,
	 * so the next movement of the mouse — after letting go — dragged the
	 * invisible thumb and set the answer to wherever the pointer had gone.
	 * The input is left to the keyboard and the screen reader, which is all
	 * it was ever kept for.
	 */
	let slider: HTMLInputElement | undefined = $state();

	/** The answer, as the native control spells it — 2.5 is "nobody said". */
	const asStep = (answer: number | null) => String(answer ?? RATING_UNRATED);

	/**
	 * Pressing a block fills up to it, rather than to the nearest edge.
	 *
	 * A range input puts its thumb on the nearest step to where you pressed, so
	 * pressing the middle of the fourth block landed on three — right for a
	 * slider, where the thumb is the thing you are placing, and wrong for a bar,
	 * where what you are saying is "up to here". The block under the pointer is
	 * the answer, which is `ceil`.
	 *
	 * Nought is the empty bar, off the left end of every block: dragging past
	 * the start reaches it, and so do the arrow keys and the × beside it.
	 */
	function fillTo(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		if (box.width === 0) return;
		const along = (event.clientX - box.left) / box.width;
		if (along <= 0) {
			value = RATING_MIN;
			return;
		}

		const to = along * RATING_MAX;
		/*
		 * And the stub of a block below the middle is no answer at all.
		 *
		 * An unanswered rating is drawn filled to 2.5, so the place where that
		 * bar ends — past the second marking, short of the third — is where you
		 * press to say nobody has answered. Without it there would be no way
		 * back to that except the × beside it.
		 */
		if (to > Math.floor(RATING_UNRATED) && to <= RATING_UNRATED) {
			value = null;
			return;
		}

		value = Math.min(RATING_MAX, Math.max(RATING_MIN, Math.ceil(to)));
	}

	/** What `fillTo` decided, told to the input as well. */
	function fill(event: PointerEvent) {
		fillTo(event);
		if (slider) slider.value = asStep(value);
	}

	function press(event: PointerEvent) {
		pressing = true;
		(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		fill(event);
	}

	function drag(event: PointerEvent) {
		if (pressing) fill(event);
	}

	function release() {
		pressing = false;
		// And once more on the way out, for the event the native control fires
		// as the press ends — by now it says the same thing this does.
		if (slider) slider.value = asStep(value);
		// The press no longer reaches the input, so it does not focus it either;
		// the arrow keys go on from where the pointer left it. On the way out
		// rather than in, because the press's own default moves focus after
		// `pointerdown` has run.
		slider?.focus({ preventScroll: true });
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
			The gauge is the control.

			It was a line with a thumb, which is a second drawing of the same fact
			— the card shows a little thermometer and the form showed a slider, so
			the thing you read and the thing you set looked nothing like each
			other. This is `Gauge`, the one on the card, with the range input laid
			over it at no opacity: the platform's own control still handles the
			finger, the arrow keys and the screen reader, and what you see it do is
			the gauge filling.
		-->
		<div class="rating-row flex items-center gap-2">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="rating-track relative min-w-0 flex-1"
				onpointerdown={press}
				onpointermove={drag}
				onpointerup={release}
				onpointercancel={release}
			>
				<Gauge {rating} {value} class="w-full" />

				<input
					type="range"
					min={RATING_MIN}
					max={RATING_MAX}
					step="0.5"
					bind:this={slider}
					value={shown}
					oninput={slide}
					aria-label={t(RATING_LABELS[rating])}
					aria-valuetext={value === null ? t('ratingPicker.notSet') : `${value} of ${RATING_MAX}`}
					title={value === null
						? t('ratings.labelNotSet', { label: t(RATING_LABELS[rating]) })
						: t('ratings.labelValueOf5', { label: t(RATING_LABELS[rating]), value })}
					class="rating-slide"
				/>
			</div>

			<span class="rating-number tabular shrink-0 text-right text-xs">
				{value ?? '–'}
			</span>

			<!--
				The way out of answering.

				There is no gesture for it — the gauge's resting place is in the
				middle of its own scale, not off the end of it — so this is the only
				way back to no answer, and it is labelled, reachable by tab and big
				enough for a thumb. It keeps its place whether or not there is a
				value, so nothing on the row moves as the gauge fills.
			-->
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

		<div class="mt-1 flex justify-between text-[0.6875rem] leading-none text-gray-500">
			<span>{ends[0]}</span>
			<span>{ends[1]}</span>
		</div>
	</div>
</div>

<style>
	/*
	 * The control, laid over the gauge it drives.
	 *
	 * Invisible rather than absent: the platform's own range still handles the
	 * arrow keys, Home and End and a screen reader, and a hand-built one would
	 * have to reimplement every one of those. The pointer is the bar's — see
	 * `slider` above for why the input may not see it. What anybody sees is
	 * the gauge underneath filling.
	 */
	.rating-slide {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		opacity: 0;
		pointer-events: none;
	}

	/*
	 * Wide enough for a finger, and no wider than the bar it draws.
	 *
	 * The input is laid over this, so if this were wider than the gauge the
	 * pressable area would run past the end of the bar and a press out there
	 * would mean nothing visible.
	 */
	/*
	 * As wide as the column it is in.
	 *
	 * It was capped at 6rem, which was right when the gauge was a small pill
	 * beside a lot of other things and is wrong now that it is the control: on
	 * a phone the form is the whole screen and the slider was a stub a sixth of
	 * the way across, under a scale — "whenever … now" — that ran the full
	 * width. The two are the same measurement and have to be the same length.
	 */
	.rating-track {
		min-height: 1.25rem;
		display: flex;
		align-items: center;
		touch-action: none;
		cursor: pointer;
	}

	.rating-number {
		min-width: 0.75rem;
		color: var(--color-gray-900);
	}

	/*
	 * Focus lands on the gauge, since that is what anybody is looking at.
	 */
	.rating-slide:focus-visible + :global(.gauge),
	.rating-track:has(.rating-slide:focus-visible) :global(.gauge) {
		outline: 2px solid var(--color-gray-900);
		outline-offset: 2px;
	}
</style>
