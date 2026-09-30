<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The few numbers worth knowing before a list or a chart, in one row.
	 *
	 * Bills and Insights each wrote this row out, and each fell apart the same
	 * way on a phone: three tiles wrapped two and one, and the amounts sat at
	 * different heights because one label took two lines. So it is one row of
	 * equal columns at every width, and the label, the amount and the note
	 * under it each share a line across the tiles (`subgrid`) — whichever
	 * label wraps, the amounts stay level.
	 */
	type Tile = {
		label: string;
		value: string;
		/** A line under the amount: words, or something drawn — a category's pill. */
		note?: string | Snippet;
	};

	let { tiles }: { tiles: Tile[] } = $props();
</script>

<dl
	class="grid gap-x-4 gap-y-0.5 border-b border-gray-200 px-4 py-3 sm:gap-x-8"
	style="grid-template-columns: repeat({tiles.length}, minmax(0, 1fr))"
>
	{#each tiles as tile (tile.label)}
		<div class="row-span-3 grid grid-rows-subgrid">
			<dt class="self-end text-xs text-gray-500">{tile.label}</dt>
			<dd class="tabular text-base font-semibold break-words text-gray-900 sm:text-lg">
				{tile.value}
			</dd>
			<dd class="min-w-0 text-xs text-gray-500">
				{#if typeof tile.note === 'function'}
					{@render tile.note()}
				{:else if tile.note}
					{tile.note}
				{/if}
			</dd>
		</div>
	{/each}
</dl>
