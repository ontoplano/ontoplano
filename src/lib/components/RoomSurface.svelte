<script lang="ts">
	/**
	 * A room's controls and what they act on, as one object.
	 *
	 * The shape every room in this app was converging on by hand and none of
	 * them quite agreed about: a bordered surface, the things that narrow the
	 * list as a block along its top with a rule under them, and the list itself
	 * filling the rest of it edge to edge.
	 *
	 * What it replaces is the reason it exists. A room was its controls
	 * floating on the page's own patterned ground with a card of rows under
	 * them and a gap between the two — several things that happen to be near
	 * each other rather than one room, and the more of them a screen had the
	 * more it read as a pile of unrelated cards. The inventory room and the
	 * task list were talked into the right shape one at a time; this is that
	 * shape, once.
	 *
	 * It clips, so an inset toolbar and the first row of a list take its
	 * corners rather than poking square ones past the curve.
	 */
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import type { Snippet } from 'svelte';

	let {
		/** The section's colour, drawn down the side. Omit for a room with none. */
		accent = '',
		/** The quieter controls: search, pickers, sort orders, filters. */
		tools,
		/** The tab's filters, on a line under the tools. */
		filters,
		/** What a guided tour calls the body of this room. */
		dataTour = '',
		children
	}: {
		accent?: string;
		tools?: Snippet;
		filters?: Snippet;
		dataTour?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class="room-surface {accent ? 'card-accent' : ''}"
	style={accent ? `--card-accent: ${accent};` : undefined}
	data-tour={dataTour || undefined}
>
	{#if tools || filters}
		<RoomToolbar inset {tools} {filters} />
	{/if}
	{@render children()}
</div>
