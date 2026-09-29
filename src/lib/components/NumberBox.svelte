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
	 * No spinner, the browser's or one of our own. The browser's is a pair of
	 * five-pixel arrows in whatever grey the platform likes; the one drawn here
	 * after it was the same pair a little larger, squeezed into a 28px field
	 * beside the number it was meant to change, and it read as the browser's
	 * all the same. A number is typed, and the arrow keys still step it.
	 * Where nudging is the point, that is `Counter`.
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
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		value = $bindable(),
		/**
		 * Classes for the box as a whole — its width, its margins, how it
		 * behaves in a flex row. They go on the wrapper, so a call site's `w-20`
		 * sizes the box whatever the input inside it does.
		 */
		class: extra = '',
		inputmode = 'decimal',
		...rest
	}: HTMLInputAttributes & {
		value?: number | string | null;
		class?: string;
	} = $props();
</script>

<span class="number-box {extra}">
	<input type="number" bind:value {inputmode} class="input tabular-nums" {...rest} />
</span>

<style>
	.number-box {
		display: block;
	}

	.input {
		width: 100%;
	}
</style>
