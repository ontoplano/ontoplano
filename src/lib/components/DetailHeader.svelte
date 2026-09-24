<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The top of a page about one thing: the way back to the list, its name,
	 * a line about it, and what can be done to it.
	 *
	 * The actions sit on the name's own line, centred on it — not on the line
	 * of the small "← All …" link above it, where a row of buttons taller than
	 * that link hung off the top of the page while the name sat lower down.
	 * When the header is too narrow for both, the actions go under everything
	 * rather than squeezing the name into a column of single words.
	 *
	 * Without `surface` it stands on the room's own white and is inset by a
	 * card's padding, so the name lines up with the card titles below it.
	 */
	let {
		title,
		/** The list this thing lives in. Already resolved by the caller. */
		back,
		/** Its own box, for a page whose other parts are boxes too. */
		surface = false,
		/** A picture before everything, the height of the whole header. */
		lead,
		/** Small labels after the name, inside the heading. */
		badges,
		/** The line under the name. */
		meta,
		actions
	}: {
		title: string;
		back?: { href: string; label: string };
		surface?: boolean;
		lead?: Snippet;
		badges?: Snippet;
		meta?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="detail-header-frame {surface ? 'border border-gray-200 bg-white shadow-card' : ''}">
	<div class="detail-header" class:has-lead={!!lead} class:is-surface={surface}>
		{#if lead}<div class="detail-lead">{@render lead()}</div>{/if}
		{#if back}
			<!-- Already resolved by the caller. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={back.href}
				class="detail-back text-xs text-gray-500 hover:text-gray-900 hover:underline"
				>{back.label}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
		<h1 class="detail-title text-lg font-bold text-gray-900">
			{title}{@render badges?.()}
		</h1>
		{#if actions}
			<div class="detail-actions flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
		{#if meta}<div class="detail-meta">{@render meta()}</div>{/if}
	</div>
</div>

<style>
	/* The actions go under the name below this width of the header itself. */
	.detail-header-frame {
		container-type: inline-size;
	}

	.detail-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'back back'
			'title actions'
			'meta meta';
		column-gap: 1rem;
		row-gap: 0.25rem;
		padding: 1rem var(--card-pad-x) 0;
	}

	.detail-header.is-surface {
		padding: 0.75rem;
	}

	.detail-header.has-lead {
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'lead back back'
			'lead title actions'
			'lead meta meta';
		column-gap: 0.75rem;
	}

	.detail-lead {
		grid-area: lead;
	}

	.detail-back {
		grid-area: back;
		justify-self: start;
	}

	.detail-title {
		grid-area: title;
		align-self: center;
	}

	.detail-actions {
		grid-area: actions;
		align-self: center;
		justify-content: flex-end;
	}

	.detail-meta {
		grid-area: meta;
		min-width: 0;
	}

	@container (width < 40rem) {
		.detail-header {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'back' 'title' 'meta' 'actions';
		}

		.detail-header.has-lead {
			grid-template-columns: auto minmax(0, 1fr);
			grid-template-areas: 'lead back' 'lead title' 'lead meta' 'actions actions';
		}

		.detail-actions {
			justify-content: flex-start;
			margin-top: 0.5rem;
		}
	}
</style>
