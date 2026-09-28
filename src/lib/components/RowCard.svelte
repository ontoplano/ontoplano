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
	 *     (tick,    |
	 *      number,  |
	 *      gauges)  | labels ... +label        actions
	 *
	 * On a phone the labels keep a line of their own under the words, the
	 * add-a-label chip stays in the rail, and the actions sit alone at the
	 * bottom on a line that never wraps.
	 *
	 * The rail runs the height of the card; whatever is last in it sits at
	 * the bottom (give it `mt-auto`). It is `--row-rail` wide whatever it
	 * holds, so the words start at `--row-text-x` on every row of every room.
	 *
	 * Goes inside a `.row-card` — the row's own element, which keeps the
	 * keyboard cursor, the selection and the padding.
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

<div class="row-card-rail row-rail">
	{@render rail()}
</div>

<div class="row-card-body flex min-w-0 flex-1 flex-col">
	{@render children()}
	<!--
		The foot of the card: labels and actions at its bottom edge, whatever
		the rail beside them makes the card's height.

		From `sm` up they share one line — labels from the left, actions at
		the right — so a tall rail does not leave the buttons floating halfway
		down beside nothing. On a phone the labels stay under the words and the
		actions drop to the bottom on a line of their own.
	-->
	<div
		class="flex flex-col max-sm:flex-1 sm:mt-auto sm:flex-row sm:items-center sm:gap-3 sm:pt-1.5"
	>
		{#if labels}
			<div class="task-labels mt-1.5 flex min-w-0 flex-wrap items-center gap-1 sm:mt-0 sm:flex-1">
				{@render labels()}
			</div>
		{/if}
		{#if controls}
			<!-- One line, always: six buttons fit a phone, and a wrapped half-row of
			     them reads as a second, different set. -->
			<div
				class="task-actions max-sm:mt-auto max-sm:pt-1.5 sm:mt-0 sm:ml-auto sm:w-auto sm:shrink-0"
				inert={quiet}
				class:opacity-50={quiet}
			>
				{@render controls()}
			</div>
		{/if}
	</div>
</div>
