<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The fields a form does not need to show to be usable.
	 *
	 * Urgency, interest and energy are all optional, and three five-point scales
	 * at the top of a create form read as work to do before you may write
	 * anything down. They live in here, one click away, with a count so nothing
	 * you did set is hidden without a trace.
	 */
	let {
		label = 'More options',
		/** How many of the fields inside currently carry a value. */
		count = 0,
		open = $bindable(false),
		/**
		 * Whether a rule sits above it.
		 *
		 * In a form of many fields it is the line that separates the ones you
		 * must fill from the ones you may. In a composer — a box, a picture
		 * button, this — there is nothing on either side of that line worth
		 * separating, and it reads as the form having ended and started again.
		 */
		divided = true,
		children
	}: {
		label?: string;
		count?: number;
		open?: boolean;
		divided?: boolean;
		children: Snippet;
	} = $props();
</script>

<!--
	Square: a border on one side of a rounded box draws a hairline that curves
	away at both ends, which reads as the top of a box that is not there.
-->
<details bind:open class="no-round col-span-12 {divided ? 'border-t border-gray-200 pt-3' : ''}">
	<summary
		class="flex cursor-pointer list-none items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
	>
		<span class="text-xs text-gray-500">{open ? '▾' : '▸'}</span>
		{label}
		{#if count > 0}
			<span
				class="tabular border border-gray-300 bg-gray-50 px-1 text-xs text-gray-600 text-gray-700"
			>
				{count}
			</span>
		{/if}
	</summary>
	<div class="mt-3 grid grid-cols-12 items-start gap-x-4 gap-y-3">
		{@render children()}
	</div>
</details>

<style>
	/* Safari still paints its own marker without this. */
	summary::-webkit-details-marker {
		display: none;
	}
</style>
