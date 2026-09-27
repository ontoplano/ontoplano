<script lang="ts">
	/**
	 * Where each part of a list card lives.
	 *
	 * A task row grew its pieces one request at a time — the number beside
	 * the labels, the labels on the buttons' line, the add-a-label chip at the
	 * end of it — and on a phone the buttons wrapped under a strip of pills
	 * they were sharing a line with. So the places are fixed here, once:
	 *
	 *     rail      | the words
	 *     (tick,    | labels, a line of their own
	 *      number,  | actions, a line of their own that never wraps
	 *      +label,  |
	 *      gauges)  |
	 *
	 * The rail runs the height of the card; whatever is last in it sits at
	 * the bottom (give it `mt-auto`). Goes inside the row's own element, which
	 * keeps the keyboard cursor, the selection and the padding.
	 */
	import type { Snippet } from 'svelte';

	let {
		rail,
		labels,
		controls,
		/** The actions held back — while rows are being selected, say. */
		quiet = false,
		children
	}: {
		rail: Snippet;
		labels?: Snippet;
		/** Named apart from a page's form `actions`, which a snippet would shadow. */
		controls?: Snippet;
		quiet?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="row-card-rail flex shrink-0 flex-col items-center gap-1.5 self-stretch">
	{@render rail()}
</div>

<div class="flex min-w-0 flex-1 flex-col">
	{@render children()}
	{#if labels}
		<div class="task-labels mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
			{@render labels()}
		</div>
	{/if}
	{#if controls}
		<!-- One line, always: six buttons fit a phone, and a wrapped half-row of
		     them reads as a second, different set. -->
		<div class="task-actions" inert={quiet} class:opacity-50={quiet}>
			{@render controls()}
		</div>
	{/if}
</div>
