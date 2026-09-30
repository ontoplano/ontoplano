<script lang="ts">
	/**
	 * A wall of albums or pictures, filling the width it is given.
	 *
	 * As many columns as fit at the tile's least width, each stretched to share
	 * what is left, so a row never ends in a band of nothing. Albums are cards
	 * with a caption and want more room than pictures, which are only their
	 * picture. `tiles` keeps each cell its own edges on a phone (`layout.css`).
	 */
	import type { Snippet } from 'svelte';

	let {
		kind = 'albums',
		class: klass = '',
		children
	}: { kind?: 'albums' | 'pictures'; class?: string; children: Snippet } = $props();
</script>

<ul class="tiles media-tiles {klass}" data-kind={kind}>
	{@render children()}
</ul>

<style>
	.media-tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr));
		align-items: start;
		gap: var(--tile-gap);
		padding: 1rem;
	}

	.media-tiles[data-kind='albums'] {
		--tile-min: 12rem;
		--tile-gap: 1rem;
	}

	.media-tiles[data-kind='pictures'] {
		--tile-min: 8rem;
		--tile-gap: 0.5rem;
	}

	@media (width < 40rem) {
		.media-tiles[data-kind='albums'] {
			--tile-min: 9rem;
			--tile-gap: 0.75rem;
		}

		.media-tiles[data-kind='pictures'] {
			--tile-min: 6.5rem;
			--tile-gap: 0.25rem;
		}
	}
</style>
