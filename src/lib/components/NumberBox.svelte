<script lang="ts">
	/**
	 * A number field, the app's own.
	 *
	 * `type="number"` and nothing clever: the platform's own control knows how
	 * to be a number on every device, and a phone raises the numeric keyboard
	 * for it. What this adds is that there is one place to change how a number
	 * field looks and behaves — spinners, keyboard hint, alignment — instead of
	 * twenty-five call sites each spelling it slightly differently.
	 *
	 * The spinner is drawn here rather than by the operating system, for the
	 * same reason `.select` draws its own chevron: the browser's is a pair of
	 * five-pixel arrows in whatever grey the platform likes, and next to a
	 * field that had been made to look like the rest of the app it was the one
	 * piece of somebody else's chrome left on the screen. It is still a real
	 * `type="number"` underneath — arrow keys step it, a phone opens its
	 * numeric keyboard, the form validates it — and the two buttons do what the
	 * native arrows did, at a size a thumb can find.
	 *
	 * `inputmode="decimal"` rather than `numeric`, because half of these are
	 * money or a weight and a keyboard with no decimal point is a keyboard you
	 * have to leave to type 1.5. Where a whole number is meant, pass
	 * `inputmode="numeric"`.
	 *
	 * Clicking one selects what is in it — see `$lib/number-fields`, which does
	 * that for every number field the app mounts — so typing 2 into a box
	 * showing 0 gives 2 rather than 02.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * How long a press has to be held before it starts repeating, and how fast
	 * it repeats once it does. The first is long enough that a tap is a single
	 * step; the second is fast enough to cross a range without waiting and slow
	 * enough to stop where you meant to.
	 */
	const HOLD_BEFORE_REPEAT_MS = 400;
	const REPEAT_EVERY_MS = 70;

	/** `step="any"`, as the attribute spells it. */
	const ANY_STEP = 'any';

	/** What the buttons move a field by when its step is `any`. */
	const STEP_FOR_ANY = 1;

	let {
		value = $bindable(),
		/**
		 * Classes for the box as a whole — its width, its margins, how it
		 * behaves in a flex row. They go on the wrapper rather than on the
		 * input because the buttons are positioned against it: a `w-20` landing
		 * on the input alone would leave the spinner sitting where the field
		 * used to end.
		 */
		class: extra = '',
		inputmode = 'decimal',
		...rest
	}: HTMLInputAttributes & {
		value?: number | string | null;
		class?: string;
	} = $props();

	let field = $state<HTMLInputElement>();

	/** A field nobody can type into is one the buttons cannot move either. */
	const locked = $derived(Boolean(rest.disabled || rest.readonly));

	function clamp(to: number, on: HTMLInputElement): number {
		if (on.min !== '' && to < Number(on.min)) return Number(on.min);
		if (on.max !== '' && to > Number(on.max)) return Number(on.max);
		return to;
	}

	function nudge(direction: 1 | -1) {
		if (!field || locked) return;
		/*
		 * A field with no step is one `stepUp()` refuses to move — it throws
		 * rather than guessing — and `step="any"` is what a price or a weight
		 * is written as. Those move by one, which is what the arrow beside a
		 * number means when the number itself has no grain.
		 */
		if (field.getAttribute('step') === ANY_STEP) {
			const from = field.valueAsNumber;
			field.valueAsNumber = clamp(
				(Number.isNaN(from) ? 0 : from) + direction * STEP_FOR_ANY,
				field
			);
		} else if (direction > 0) field.stepUp();
		else field.stepDown();

		// The value was changed from outside the browser's own editing, so the
		// events a binding and a form listener wait for have to be said aloud.
		field.dispatchEvent(new Event('input', { bubbles: true }));
		field.dispatchEvent(new Event('change', { bubbles: true }));
	}

	let waiting: ReturnType<typeof setTimeout> | undefined;
	let repeating: ReturnType<typeof setInterval> | undefined;

	function stop() {
		clearTimeout(waiting);
		clearInterval(repeating);
		waiting = undefined;
		repeating = undefined;
	}

	function press(event: PointerEvent, direction: 1 | -1) {
		/*
		 * The press stays where it was: without this the button takes focus off
		 * the field being edited, and on a phone the field losing focus drops
		 * the keyboard mid-edit. Nothing here needs focus — the buttons are out
		 * of the tab order, because the arrow keys already do this.
		 */
		event.preventDefault();
		if (locked) return;
		nudge(direction);
		waiting = setTimeout(() => {
			repeating = setInterval(() => nudge(direction), REPEAT_EVERY_MS);
		}, HOLD_BEFORE_REPEAT_MS);
	}
</script>

<!-- A held button has to stop when the finger lifts, wherever it has drifted to. -->
<svelte:window onpointerup={stop} onpointercancel={stop} />

<span class="number-box {extra}">
	<input
		bind:this={field}
		type="number"
		bind:value
		{inputmode}
		class="input tabular-nums"
		{...rest}
	/>
	<span class="steps">
		<button
			type="button"
			tabindex="-1"
			aria-label={t('ui.more')}
			disabled={locked}
			onpointerdown={(event) => press(event, 1)}
			onpointerleave={stop}
		>
			<Icon name="chevron-up" />
		</button>
		<button
			type="button"
			tabindex="-1"
			aria-label={t('ui.less')}
			disabled={locked}
			onpointerdown={(event) => press(event, -1)}
			onpointerleave={stop}
		>
			<Icon name="chevron-down" />
		</button>
	</span>
</span>

<style>
	.number-box {
		/*
		 * The strip the buttons stand in, and the room the digits give up for
		 * them. One value, because a field whose padding and whose spinner
		 * disagree either overlaps its own number or leaves a gap beside it.
		 */
		--step-column: 1.75rem;
		/* The field's own border, which the strip stands inside rather than on. */
		--field-border: 1px;
		position: relative;
		display: block;
	}

	.input {
		padding-right: var(--step-column);
		/* Firefox's arrows come off with the appearance; Chrome's need the rule below. */
		appearance: textfield;
	}

	.input::-webkit-outer-spin-button,
	.input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	/* Inside the field's border rather than over it, so the box still reads as one box. */
	.steps {
		position: absolute;
		top: var(--field-border);
		right: var(--field-border);
		bottom: var(--field-border);
		display: flex;
		width: calc(var(--step-column) - var(--field-border));
		flex-direction: column;
	}

	.steps button {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		/*
		 * Every button on a phone is given a 44px target; two of these share
		 * the height of one field, and the blanket rule would make that field
		 * twice as tall as every other one in the form.
		 */
		min-height: 0;
		color: var(--color-gray-500);
		/* A press, not a scroll that might become one. */
		touch-action: manipulation;
	}

	/*
	 * Colour and nothing else, the way `.select`'s chevron answers a pointer.
	 * A tonal pad behind one of them draws a rounded rectangle inside a field
	 * whose own corner is rounded to a different degree — two curves that do
	 * not agree, in a strip this narrow. The number moving is the other half
	 * of the answer, and it is the half somebody is looking at.
	 */
	.steps button:hover:not(:disabled),
	.steps button:active:not(:disabled) {
		color: var(--color-gray-900);
	}
</style>
