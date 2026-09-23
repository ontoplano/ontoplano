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
		filters,
		inset = false
	}: {
		/** The quieter controls: secondary buttons, pickers, sort orders. */
		tools?: Snippet;
		/** The tab's filters, in one row under the tools. */
		filters?: Snippet;
		/**
		 * Drawn as the top block of the surface it acts on, rather than as a
		 * row above it — see `.room-toolbar-inset`.
		 */
		inset?: boolean;
	} = $props();
</script>

<!--
	Nothing at all when there is nothing in it.

	`{#if tools}` is true for a snippet that renders nothing, which is not the
	same question — the notebooks page passed `{#snippet tools()}{/snippet}` and
	got an empty block with a rem of margin under it, a gap on the page that no
	markup on the page explained. The rule in the style below asks what actually
	came out of the snippets rather than whether they were handed over.
-->
{#if tools || filters}
	<div class="room-toolbar {inset ? 'room-toolbar-inset' : ''}">
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

	/* A toolbar whose rows all rendered nothing takes no room and no margin. */
	.room-toolbar:not(:has(.room-toolbar-row > *)) {
		display: none;
	}

	.room-toolbar-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	/*
	 * Loose controls inside a room are not flush against its sides.
	 *
	 * The body only gives itself padding when its content is not already a
	 * full-width card — a list wants its rows edge to edge. A page with both,
	 * like the activities room, then had its controls touching the sides. The
	 * inset toolbar is a block of that surface and carries its own padding, so
	 * this is only for the loose one.
	 */
	:global(.room-body) > .room-toolbar:not(.room-toolbar-inset),
	:global(.room-body) > :global(*) > .room-toolbar:not(.room-toolbar-inset) {
		padding-inline: 1rem;
		padding-top: 0.75rem;
	}

	/* Filters read as a second rank: same row shape, quieter type. */
	.room-toolbar-filters {
		font-size: 0.875rem;
	}

	/*
	 * The controls as the top of the thing they act on.
	 *
	 * A room whose content is one surface keeps its controls on that surface:
	 * a block along the top of the same white, with the rule under it doing
	 * the separating rather than a gap. Loose on the page above it they were a
	 * second object floating over the one they belong to. Inventory draws its
	 * filter block this way by hand; a tab that uses this toolbar asks for it
	 * with `inset`.
	 */
	.room-toolbar-inset {
		padding: 1rem;
		margin-bottom: 0;
		border-bottom: 1px solid var(--color-gray-200);
	}
</style>
