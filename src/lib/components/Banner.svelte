<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * One message that interrupts the page: an error, a confirmation, a warning.
	 *
	 * Every one of these used to be its own ad-hoc coloured box, so no two
	 * looked alike. They all share one shape now — the staging band's, which
	 * was the one message in the app that read as designed rather than dumped:
	 * an icon, a heavy accent on the left edge, a wash of the accent behind.
	 */
	let {
		kind = 'error',
		message = null,
		children
	}: {
		kind?: 'error' | 'success' | 'warning' | 'info';
		/** The whole message, when it is one sentence. For anything richer, use children. */
		message?: string | null;
		children?: Snippet;
	} = $props();

	const ICONS = { error: 'error', success: 'check', warning: 'warning', info: 'info' } as const;
</script>

<div class="banner {kind}" role={kind === 'error' ? 'alert' : 'status'}>
	<Icon name={ICONS[kind]} size={16} />
	<div class="body">
		{#if children}{@render children()}{:else}{message}{/if}
	</div>
</div>

<style>
	.banner {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius-sm, 0);
		background-color: color-mix(in srgb, var(--accent) 8%, var(--color-white));
		padding: 0.85rem 1.1rem;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--color-gray-900);
	}

	/* The text takes the room, so anything beside it — a dismiss button — sits
	   at the far edge rather than against the words. */
	.body {
		flex: 1;
		min-width: 0;
	}

	.banner :global(svg) {
		flex: none;
		margin-top: 0.15rem;
		color: var(--accent);
	}

	.error {
		--accent: var(--color-red-600, #dc2626);
	}

	/*
	 * Blue, not green.
	 *
	 * The person this is built for is colourblind, and red-against-green is the
	 * pair that carries no information for him — which is the whole job of the
	 * accent on a message that is either "done" or "did not happen". Blue for
	 * good and red for bad, here as in the alerts the boxes send. The tick and
	 * the words carry it too; the colour is never the only signal.
	 */
	.success {
		--accent: var(--color-blue-600, #2563eb);
	}

	.warning {
		--accent: var(--color-amber-600, #d97706);
	}

	.info {
		--accent: var(--color-blue-600, #2563eb);
	}
</style>
