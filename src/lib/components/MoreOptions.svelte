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
		children
	}: {
		label?: string;
		count?: number;
		open?: boolean;
		children: Snippet;
	} = $props();
</script>

<!--
	Square: a border on one side of a rounded box draws a hairline that curves
	away at both ends, which reads as the top of a box that is not there.
-->
<details bind:open class="no-round col-span-12 border-t border-gray-200 pt-3">
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
