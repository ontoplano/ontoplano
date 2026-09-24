<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Cards side by side, with the page's one gap between them.
	 *
	 * A card sitting straight in a room steps out to the room's edges (see
	 * `.room-body` in `layout.css`). That is right for one card and wrong for
	 * two in a row: each stepped a rem out on both sides, so neighbours slid
	 * under each other and a card in the second row was a different width from
	 * the one above it. Cards laid out here never step out — the grid is the
	 * layout, and every column edge lines up with the heading above it.
	 *
	 * Below `lg` it is one column; the gap stays.
	 */
	let {
		/**
		 * The columns from `lg` up. `aside` is a narrow column beside a wide one
		 * — a recipe's ingredients beside its method.
		 */
		columns = 2,
		/**
		 * Step out to the room's edges as a whole, like a full-width card. For a
		 * page whose other cards do, so the edges line up; leave it off where the
		 * grid is the page and the cards want the room's gutter around them.
		 */
		bleed = false,
		class: className = '',
		children
	}: {
		columns?: 2 | 3 | 'aside';
		bleed?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	/* Written out whole so Tailwind finds them. */
	const COLUMNS = {
		2: 'lg:grid-cols-2',
		3: 'lg:grid-cols-3',
		aside: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'
	} as const;
</script>

<div
	class="card-grid {bleed ? 'card-grid-bleed' : ''} grid grid-cols-[minmax(0,1fr)] gap-4 {COLUMNS[
		columns
	]} {className}"
>
	{@render children()}
</div>
