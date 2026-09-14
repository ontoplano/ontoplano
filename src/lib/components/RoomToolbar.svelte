<script lang="ts">
	/**
	 * The row of controls under a room's tabs, the same shape on every screen.
	 *
	 * Ten tabs each laid out their own and they had drifted: filters sprawling
	 * on one tab and folded on the next, three ragged rows on a third, and
	 * every tab's content starting at its own height. A tab fills this in now
	 * rather than building one.
	 *
	 * The screen's primary verb is NOT here — it lives in the room's bar, top
	 * right, declared through `$lib/room-action`. What is left is the quiet
	 * half: pickers, sort orders, secondary buttons, and the tab's filters on
	 * a line of their own underneath.
	 *
	 * A tab with nothing to put here renders nothing at all, and its content
	 * starts where the tabs end — which is the same place on every screen.
	 */
	import type { Snippet } from 'svelte';

	let {
		tools,
		filters
	}: {
		/** The quieter controls: secondary buttons, pickers, sort orders. */
		tools?: Snippet;
		/** The tab's filters, in one row under the tools. */
		filters?: Snippet;
	} = $props();
</script>

{#if tools || filters}
	<div class="room-toolbar">
		{#if tools}
			<div class="room-toolbar-row">{@render tools()}</div>
		{/if}
		{#if filters}
			<div class="room-toolbar-row room-toolbar-filters">{@render filters()}</div>
		{/if}
	</div>
{/if}

<style>
	/*
	 * The gaps are the point: every tab's controls sit the same distance from
	 * its tabs and from its content, whatever the tab put in them.
	 */
	.room-toolbar {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.room-toolbar-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	/* Filters read as a second rank: same row shape, quieter type. */
	.room-toolbar-filters {
		font-size: 0.875rem;
	}
</style>
